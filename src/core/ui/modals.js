import { Modal, Notice, Setting } from 'obsidian';
import { t } from '../i18n/index.js';
import { isImeKey, checklistNameError } from '../composables/tasks-logic.js';

// ============================================================================
// Obsidian 原生 Modal 辅助
// ----------------------------------------------------------------------------
// 弹窗 / 确认框优先用 Obsidian 自带 Modal + Setting 体系：样式（边框、底色、
// 按钮强调色）完全跟随主题，不受 Element Plus 与 Obsidian 全局样式互相污染。
// 文案通过 i18n 的 t() 跟随 Obsidian 界面语言。
// ============================================================================

/** 任务链接编辑弹窗（原生 Modal；link 为 null 表示新增） */
export class LinkFormModal extends Modal {
  /**
   * @param {object} opts
   * @param {object|null} opts.link 编辑时传 { text, url }，新增传 null
   * @param {(item: { text: string, url: string }) => void} opts.onSave 确认回调
   * @param {() => void} [opts.onDelete] 删除回调（仅编辑态显示按钮）
   */
  constructor(app, { link = null, onSave, onDelete }) {
    super(app);
    this.link = link;
    this.onSave = onSave;
    this.onDelete = onDelete;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('mylife-form-modal');
    this.titleEl.setText(this.link ? t('modals.linkEdit') : t('modals.linkAdd'));

    const textInput = contentEl.createEl('input', { cls: 'mylife-input', type: 'text' });
    textInput.placeholder = t('modals.linkTextPlaceholder');
    textInput.value = (this.link && this.link.text) || '';
    const urlInput = contentEl.createEl('input', { cls: 'mylife-input', type: 'text' });
    urlInput.placeholder = 'https://';
    urlInput.value = (this.link && this.link.url) || '';

    const ops = new Setting(contentEl);
    if (this.link) {
      ops.addButton((b) => b.setButtonText(t('modals.linkDelete')).setWarning().onClick(() => {
        const cb = this.onDelete;
        this.close();
        if (cb) cb();
      }));
    }
    ops.addButton((b) => b.setButtonText(t('common.cancel')).onClick(() => this.close()));
    ops.addButton((b) => b.setButtonText(t('common.confirm')).setCta().onClick(() => {
      const url = (urlInput.value || '').trim();
      if (!url) { new Notice(t('modals.linkUrlRequired')); return; }
      const text = (textInput.value || '').trim() || url;
      const cb = this.onSave;
      this.close();
      if (cb) cb({ text, url });
    }));

    setTimeout(() => { textInput.focus(); textInput.select(); }, 50);
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** 通用确认弹窗（删除等危险操作） */
export class ConfirmModal extends Modal {
  /**
   * @param {object} opts
   * @param {string} opts.title 标题
   * @param {string} opts.message 正文说明
   * @param {string} [opts.confirmText] 确认按钮文案（默认「确定」）
   * @param {boolean} [opts.danger] 确认按钮用警示色
   * @param {() => void} opts.onConfirm 确认后回调
   */
  constructor(app, { title = t('common.confirm'), message = '', confirmText = t('common.confirm'), danger = false, onConfirm }) {
    super(app);
    this.title = title;
    this.message = message;
    this.confirmText = confirmText;
    this.danger = danger;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    this.titleEl.setText(this.title);
    this.contentEl.createEl('p', { text: this.message });

    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText(t('common.cancel')).onClick(() => this.close()))
      .addButton((b) => {
        b.setButtonText(this.confirmText);
        if (this.danger) b.setWarning();
        b.onClick(() => {
          const cb = this.onConfirm;
          this.close();
          if (cb) cb();
        });
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

/**
 * 新建清单弹窗（只要名称）。
 * 落盘由调用方在 onSubmit 里完成：成功才关窗，失败（重名/非法名/写盘错误）
 * 由 onSubmit 抛 Error，这里 Notice 提示并保持弹窗打开，让用户改个名字重试。
 */
export class ChecklistFormModal extends Modal {
  /** @param {(name: string) => Promise<void>} opts.onSubmit 成功返回、失败抛 Error */
  constructor(app, { onSubmit } = {}) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('mylife-form-modal');
    this.titleEl.setText(t('app.clCreateTitle'));

    const inputId = 'dada-cl-name-' + Date.now();
    contentEl.createEl('label', { cls: 'mylife-form-label', text: t('app.clName'), attr: { for: inputId } });
    const input = contentEl.createEl('input', { cls: 'mylife-input', type: 'text', attr: { id: inputId } });
    input.placeholder = t('app.clNamePh');

    let submitBtn = null;
    let busy = false;
    const submit = async () => {
      if (busy) return;
      const name = String(input.value || '').trim();
      // 与数据层共用同一份校验规则（tasks-logic.checklistNameError）
      const nameErr = checklistNameError(name);
      if (nameErr) {
        new Notice(nameErr === 'missing_name' ? t('app.clNameRequired') : t('app.clNameInvalid'));
        input.focus();
        return;
      }
      busy = true;
      if (submitBtn) submitBtn.setDisabled(true);
      try {
        await this.onSubmit(name);
        this.close();
      } catch (e) {
        new Notice((e && e.message) || t('app.clCreateFail'));
      } finally {
        busy = false;
        if (submitBtn) submitBtn.setDisabled(false);
      }
    };

    // 输入法组字中的回车只上屏候选词，不提交（与仓库内其它表单一致）
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || isImeKey(e)) return;
      e.preventDefault();
      submit();
    });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText(t('common.cancel')).onClick(() => this.close()))
      .addButton((b) => {
        submitBtn = b;
        b.setButtonText(t('common.create')).setCta().onClick(() => submit());
      });

    setTimeout(() => input.focus(), 50);
  }

  onClose() {
    this.contentEl.empty();
  }
}
