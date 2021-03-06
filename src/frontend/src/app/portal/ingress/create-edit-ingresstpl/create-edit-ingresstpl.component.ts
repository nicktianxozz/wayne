import { Component, OnInit, ViewChild } from '@angular/core';
import { Location } from '@angular/common';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/distinctUntilChanged';
import { NgForm } from '@angular/forms';
import { MessageHandlerService } from '../../../shared/message-handler/message-handler.service';
import { ActionType, appLabelKey, namespaceLabelKey } from '../../../shared/shared.const';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs/Observable';
import { App } from '../../../shared/model/v1/app';
import { AppService } from '../../../shared/client/v1/app.service';
import { CacheService } from '../../../shared/auth/cache.service';
import { AceEditorService } from '../../../shared/ace-editor/ace-editor.service';
import { AceEditorMsg } from '../../../shared/ace-editor/ace-editor';
import { defaultIngress } from '../../../shared/default-models/ingress.const';
import { mergeDeep } from '../../../shared/utils';
import { Ingress } from '../../../shared/model/v1/ingress';
import { IngressTpl } from '../../../shared/model/v1/ingresstpl';
import { IngressService } from '../../../shared/client/v1/ingress.service';
import { IngressTplService } from '../../../shared/client/v1/ingresstpl.service';
import { AuthService } from '../../../shared/auth/auth.service';
import { IngressRule, KubeIngress } from '../../../shared/model/v1/kubernetes/ingress';


@Component({
  selector: 'create-edit-ingresstpl',
  templateUrl: './create-edit-ingresstpl.component.html',
  styleUrls: ['./create-edit-ingresstpl.scss']
})
export class CreateEditIngressTplComponent implements OnInit {
  ngForm: NgForm;
  @ViewChild('ngForm')
  currentForm: NgForm;

  ingressTpl: IngressTpl = new IngressTpl();
  checkOnGoing: boolean = false;
  isSubmitOnGoing: boolean = false;
  actionType: ActionType;
  app: App;
  ingress: Ingress;
  kubeIngress: KubeIngress;

  labelSelector = [];


  constructor(private ingressTplService: IngressTplService,
              private ingressService: IngressService,
              private location: Location,
              private router: Router,
              private appService: AppService,
              private route: ActivatedRoute,
              public authService: AuthService,
              public cacheService: CacheService,
              private aceEditorService: AceEditorService,
              private messageHandlerService: MessageHandlerService) {
  }


  get appLabelKey(): string {
    return this.authService.config[appLabelKey]
  }

  initDefault() {
    this.kubeIngress = JSON.parse(defaultIngress);
  }


  onAddSelector() {
    this.labelSelector.push({'key': '', 'value': ''});
  }

  ngOnInit(): void {
    this.initDefault();
    const appId = parseInt(this.route.parent.snapshot.params['id'], 10);
    const namespaceId = this.cacheService.namespaceId;
    const ingressId = parseInt(this.route.snapshot.params['ingressId'], 10);
    const tplId = parseInt(this.route.snapshot.params['tplId'], 10);
    const observables = Array(
      this.appService.getById(appId, namespaceId),
      this.ingressService.getById(ingressId, appId),
    );
    if (tplId) {
      this.actionType = ActionType.EDIT;
      observables.push(this.ingressTplService.getById(tplId, appId));
    } else {
      this.actionType = ActionType.ADD_NEW;
    }
    Observable.combineLatest(observables).subscribe(
      response => {
        this.app = response[0].data;
        this.ingress = response[1].data;
        const tpl = response[2];
        if (tpl) {
          this.ingressTpl = tpl.data;
          this.ingressTpl.description = null;
          this.saveIngressTpl(JSON.parse(this.ingressTpl.template));
        } else {
          this.labelSelector.push({'key': 'app', 'value': this.app.name});
        }
      },
      error => {
        this.messageHandlerService.handleError(error);
      }
    );
  }


  onCancel() {
    this.currentForm.reset();
    this.location.back();
  }

  onSubmit() {
    if (this.isSubmitOnGoing) {
      return;
    }
    this.isSubmitOnGoing = true;

    let newIngress = JSON.parse(JSON.stringify(this.kubeIngress));
    newIngress = this.generateIngress(newIngress);
    this.ingressTpl.ingressId = this.ingress.id;
    this.ingressTpl.template = JSON.stringify(newIngress);

    this.ingressTpl.id = undefined;
    this.ingressTpl.name = this.ingress.name;
    this.ingressTplService.create(this.ingressTpl, this.app.id).subscribe(
      status => {
        this.isSubmitOnGoing = false;
        this.messageHandlerService.showSuccess('创建 Ingress 模版成功！');
        this.router.navigate([`portal/namespace/${this.cacheService.namespaceId}/app/${this.app.id}/ingress/${this.ingress.id}`]);
      },
      error => {
        this.isSubmitOnGoing = false;
        this.messageHandlerService.handleError(error);

      }
    );
  }

  public get isValid(): boolean {
    return this.currentForm &&
      this.currentForm.valid &&
      !this.isSubmitOnGoing &&
      !this.checkOnGoing && this.isValidIngress();
  }

  isValidIngress(): boolean {
    if (this.kubeIngress.spec.rules.length === 0) {
      return false;
    }
    if (this.kubeIngress.spec.rules.length === 0) {
      return false;
    }
    for (const rule of this.kubeIngress.spec.rules) {
      if (rule.host.length === 0) {
        return false;
      }
      if (rule.http.paths.length === 0) {
        return false
      }
      for (const svc of rule.http.paths) {
        if (svc.backend.servicePort.IntVal === 0 || svc.backend.serviceName.length === 0) {
          return false;
        }
        if (svc.path.length === 0) {
          return false;
        }
      }
    }
    return true;
  }

  buildLabels(labels: {}) {
    if (!labels) {
      labels = {};
    }
    labels[this.authService.config[appLabelKey]] = this.app.name;
    labels[this.authService.config[namespaceLabelKey]] = this.cacheService.currentNamespace.name;
    labels['app'] = this.ingress.name;
    return labels;
  }

  generateIngress(kubeIngress: KubeIngress): KubeIngress {
    kubeIngress.metadata.name = this.ingress.name;
    kubeIngress.metadata.labels = this.buildLabels(this.kubeIngress.metadata.labels);
    return kubeIngress;
  }

  openModal(): void {
    // let copy = Object.assign({}, myObject).
    // but this wont work for nested objects. SO an alternative would be
    let newIngress = JSON.parse(JSON.stringify(this.kubeIngress));
    newIngress = this.generateIngress(newIngress);
    this.aceEditorService.announceMessage(AceEditorMsg.Instance(newIngress, true));
  }

  saveIngressTpl(kubeIngress: KubeIngress) {
    this.fillDefault(kubeIngress);
  }

  fillDefault(kubeIngress: KubeIngress) {
    this.kubeIngress = mergeDeep(JSON.parse(defaultIngress), kubeIngress);
  }

  defaultRule() {
    const rule = new IngressRule();
    rule.host = '';
    return rule;

  }
}

