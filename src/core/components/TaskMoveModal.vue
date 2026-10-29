<template>
  <div v-if="open" class="tk-mask" @click.self="close">
    <div class="tk-modal tk-move-modal">
      <button class="tk-close" @click="close"><i class="la la-times"></i></button>
      <div class="tk-modal-head">
        <h3 class="tk-modal-title">{{ $t(editing ? 'editor.moveTitle' : 'editor.moveTitleNew') }}</h3>
      </div>
      <!-- 当前归属：搬之前先看清「从哪到哪」 -->
      <p class="tk-move-cur">{{ $t('editor.moveCurrent', { name: currentName || '—' }) }}</p>
      <div class="tk-loc-row">
        <label class="tk-field">
          <span>{{ $t('editor.locListLbl') }}</span>
          <select v-model="listKey" :disabled="busy" @change="onListChange">
            <option v-if="!editing" value="">{{ $t('editor.locAuto') }}</option>
            <option v-if="curIsDate" :value="curKey">{{ $t('editor.locDiary', { date: curKey }) }}</option>
            <option v-if="curOrphan" :value="curKey">{{ currentName || curKey }}</option>
            <option :value="inboxKey">{{ $t('editor.locInbox') }}</option>
            <option v-for="c in lists" :key="c.key" :value="c.key">{{ c.name }}</option>
          </select>
        </label>
        <label class="tk-field">
          <span>{{ $t('editor.locGroupLbl') }}</span>
          <select v-model="group" :disabled="busy || !canPickGroups">
            <option value="">{{ $t('app.ungrouped') }}</option>
            <option v-if="groupMissing" :value="group">{{ group }}</option>
            <option v-for="g in groups" :key="g" :value="g">{{ g }}</option>
          </select>
        </label>
      </div>
      <div v-if="error" class="tk-err">{{ error }}</div>
      <!-- 底栏：单一主按钮（取消走 × / Esc / 点遮罩），与「新建清单」弹窗同一套原语 -->
      <div class="tk-modal-ops">
        <span class="spacer"></span>
        <button class="btn btn-gold" type="button" :disabled="busy || loading || !changed" @click="confirm">
          <i class="la la-exchange"></i>{{ editing ? $t('editor.locMoveBtn') : $t('common.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
// 「移动任务 / 设置保存位置」弹窗（Vue 组件 + VueModal 原生外壳）。
// 单独成窗（而不是塞进任务编辑弹窗）的原因：编辑器表单本身已经很长，内联选择器会把
// 底部的保存按钮挤出可视区；这里复用同一套 tk- 原语与主按钮配色，观感仍是一个体系。
import { Tasks } from '../composables/useTasks.js';
import { INBOX_KEY } from '../composables/tasks-logic.js';

// 日期键（日记文件）：YYYY-MM-DD。清单 / 收件箱都不是日期键
const isDateKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(String(k || ''));

export default {
  name: 'TaskMoveModal',
  props: {
    open: { type: Boolean, default: false },
    // 编辑态：确认后立即移动并落盘；新建态：只记录目标，保存时创建到该清单
    editing: { type: Boolean, default: false },
    lists: { type: Array, default: () => [] },
    currentKey: { type: String, default: '' },
    currentGroup: { type: String, default: '' },
    currentName: { type: String, default: '' },
    // 确认回调：返回 Promise，抛错时留在弹窗里显示原因（不关窗，避免「移动失败但界面已关闭」）
    onConfirm: { type: Function, default: null }
  },
  emits: ['confirm', 'update:open'],
  data() {
    return {
      inboxKey: INBOX_KEY,
      listKey: '',
      group: '',
      groups: [],
      loading: false,
      busy: false,
      error: '',
      curKey: '',
      curGroup: ''
    };
  },
  computed: {
    curIsDate() { return isDateKey(this.curKey); },
    // 当前清单不在清单列表里（文件被删 / 改名后 metadataCache 还没刷新）：仍列出原位，避免下拉空白
    curOrphan() {
      if (!this.curKey || this.curKey === INBOX_KEY || this.curIsDate) return false;
      return !this.lists.some((x) => x.key === this.curKey);
    },
    // 只有收件箱 / 清单才有 ### 分组可选；「按日期自动」「日记」没有
    canPickGroups() { return !!this.listKey && !isDateKey(this.listKey); },
    // 当前分组在目标文件里已不存在（被改名/删除）：仍列出来，避免下拉空白
    groupMissing() { return !!this.group && !this.groups.includes(this.group); },
    changed() { return this.listKey !== this.curKey || this.group !== this.curGroup; }
  },
  watch: {
    open: { handler(v) { if (v) this.init(); }, immediate: true }
  },
  methods: {
    async init() {
      this.error = '';
      this.busy = false;
      this.curKey = this.currentKey || '';
      this.curGroup = this.currentGroup || '';
      this.listKey = this.curKey;
      this.group = this.curGroup;
      this.groups = [];
      if (this.canPickGroups) await this.loadGroups();
    },
    async loadGroups() {
      if (!this.canPickGroups) { this.groups = []; return; }
      this.loading = true;
      try {
        const r = this.listKey === INBOX_KEY
          ? await Tasks.loadInboxGroups()
          : await Tasks.loadChecklistGroups(this.listKey);
        this.groups = ((r && r.groups) || [])
          .map((g) => g.title)
          .filter((x) => x && String(x).trim());
      } catch (e) {
        this.groups = [];
      } finally {
        this.loading = false;
      }
    },
    // 换清单：分组回到「未分组」；若选回原位则恢复当前分组，避免误移动
    async onListChange() {
      this.group = this.listKey === this.curKey ? this.curGroup : '';
      this.groups = [];
      if (this.canPickGroups) await this.loadGroups();
    },
    async confirm() {
      if (this.busy || this.loading || !this.changed) return;
      const target = { key: this.listKey || '', group: this.group || '' };
      if (!this.onConfirm) {
        this.$emit('confirm', target);
        this.close();
        return;
      }
      this.busy = true;
      this.error = '';
      try {
        await this.onConfirm(target);
        this.close();
      } catch (e) {
        this.error = this.$t('editor.moveFail') + ((e && e.reason) || (e && e.message) || e);
      } finally {
        this.busy = false;
      }
    },
    close() { this.$emit('update:open', false); }
  }
};
</script>

<style scoped>
/* 两列下拉与字段间距由 task-modal.css 的 .tk-loc-row 统一（编辑器/弹窗共用） */
.tk-move-modal { max-width: 420px; }
.tk-move-cur { margin: -6px 0 14px; font-size: 12px; color: var(--ink-soft); }
</style>
