<template>
  <div v-if="open" class="tk-mask" @click.self="close">
    <div class="tk-modal">
      <button class="tk-close" @click="close"><i class="la la-times"></i></button>
      <div class="tk-modal-head">
        <h3 class="tk-modal-title">{{ $t('app.clCreateTitle') }}</h3>
      </div>
      <label class="tk-field">
        <span>{{ $t('app.clName') }}</span>
        <input ref="nameInput" v-model="name" type="text" :disabled="saving"
               :placeholder="$t('app.clNamePh')" @keydown.enter="onNameEnter" />
      </label>
      <div v-if="error" class="tk-err">{{ error }}</div>
      <!-- 底栏：与任务编辑器一致，右侧唯一主按钮（取消走原生 Modal 的 × / Esc / 点遮罩） -->
      <div class="tk-modal-ops">
        <span class="spacer"></span>
        <button class="btn btn-gold" type="button" :disabled="saving || !name.trim()" @click="submit()">
          <i class="la la-plus"></i>{{ saving ? $t('app.clCreating') : $t('common.create') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
// 新建清单弹窗（Vue 组件 + VueModal 原生外壳）。
// 外壳 / 字段 / 按钮全部复用 TaskEditorModal 同一套原语（task-modal.css 的 tk-mask / tk-modal /
// tk-field / btn 等），因此间距、边框、主按钮配色、Esc / 点遮罩关闭、Enter 提交等交互与「新建任务」一致。
import { Tasks } from '../composables/useTasks.js';
import { checklistNameError, isImeKey } from '../composables/tasks-logic.js';

export default {
  name: 'ChecklistEditorModal',
  props: {
    open: { type: Boolean, default: false }
  },
  emits: ['saved', 'update:open'],
  data() {
    return {
      name: '',
      saving: false,
      error: ''
    };
  },
  watch: {
    // immediate：VueModal 桥挂载时 open 已为 true，必须立即初始化并聚焦
    open: { handler(v) { if (v) this.init(); }, immediate: true }
  },
  methods: {
    init() {
      this.name = '';
      this.saving = false;
      this.error = '';
      this.$nextTick(() => { if (this.$refs.nameInput) this.$refs.nameInput.focus(); });
    },
    onNameEnter(e) {
      // 输入法组字中的回车只上屏候选词，不提交
      if (isImeKey(e)) return;
      this.submit();
    },
    async submit() {
      // keydown 阶段触发，长按回车会连发：saving 锁防重复创建
      if (this.saving) return;
      const name = String(this.name || '').trim();
      const nameErr = checklistNameError(name);
      if (nameErr) {
        this.error = nameErr === 'missing_name' ? this.$t('app.clNameRequired') : this.$t('app.clNameInvalid');
        return;
      }
      this.saving = true;
      this.error = '';
      try {
        // 落盘由数据层完成；成功才关窗，失败把原因显示在表单内（与任务编辑器一致，不弹 Notice）
        const item = await Tasks.createChecklist(name);
        this.$emit('saved', item);
        this.close();
      } catch (e) {
        const reason = e && e.reason;
        if (reason === 'exists') this.error = this.$t('app.clExists', { name });
        else if (reason === 'exists_other') this.error = this.$t('app.clExistsOther', { name });
        else if (reason === 'bad_folder') this.error = this.$t('app.clBadFolder');
        else if (reason === 'bad_name') this.error = this.$t('app.clNameInvalid');
        else if (reason === 'missing_name') this.error = this.$t('app.clNameRequired');
        else this.error = this.$t('app.clCreateFail') + (reason || (e && e.message) || e);
      } finally {
        this.saving = false;
      }
    },
    close() { this.$emit('update:open', false); }
  }
};
</script>
