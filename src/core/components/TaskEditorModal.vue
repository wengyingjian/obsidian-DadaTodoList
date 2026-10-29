<template>
  <div v-if="open" class="tk-mask" @click.self="close">
    <div ref="modalEl" class="tk-modal" @click="onModalClick">
      <button class="tk-close" @click="close"><i class="la la-times"></i></button>
      <div class="tk-modal-head">
        <h3 class="tk-modal-title">{{ editing ? $t('editor.editTitle') : $t('editor.newTitle') }}</h3>
        <!-- 所在清单 / 分组：点 chip 在当前弹窗里展开下拉浮层，确认即移动（不再叠第二层弹窗） -->
        <span v-if="showLoc" ref="locChip" class="tk-loc-chip" :class="{ on: locOpen }" :title="locTip" @click="toggleLoc">
          <i class="la" :class="locIcon"></i>{{ locChipText }}<i class="la la-angle-down tk-loc-caret"></i>
        </span>
        <button v-if="editing" class="btn btn-icon" type="button" v-tooltip="$t('editor.openFileTip')" @click="openFile">
          <i class="la la-external-link"></i>
        </button>
      </div>
      <!-- 归属下拉浮层：绝对定位在 chip 下方，不占表单高度；点「移动」立即落盘 -->
      <div v-if="showLoc && locOpen" ref="locPop" class="tk-loc-pop" :style="locPopStyle" @click.stop>
        <p class="tk-loc-cur">{{ $t('editor.moveCurrent', { name: locChipText }) }}</p>
        <label class="tk-field">
          <span>{{ $t('editor.locListLbl') }}</span>
          <select v-model="dKey" :disabled="locBusy" @change="onDraftListChange">
            <option v-if="!editing" value="">{{ $t('editor.locAuto') }}</option>
            <option v-if="locIsOrigDate" :value="locKey">{{ $t('editor.locDiary', { date: locKey }) }}</option>
            <option v-if="locOrphan" :value="locKey">{{ locListName || locKey }}</option>
            <option :value="inboxKey">{{ $t('editor.locInbox') }}</option>
            <option v-for="c in assignLists" :key="c.key" :value="c.key">{{ c.name }}</option>
          </select>
        </label>
        <label class="tk-field">
          <span>{{ $t('editor.locGroupLbl') }}</span>
          <select v-model="dGroup" :disabled="locBusy || !locCanPickGroups">
            <option value="">{{ $t('app.ungrouped') }}</option>
            <option v-if="locGroupMissing" :value="dGroup">{{ dGroup }}</option>
            <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
          </select>
        </label>
        <div v-if="locError" class="tk-err tk-loc-err">{{ locError }}</div>
        <div class="tk-loc-actions">
          <span class="spacer"></span>
          <button class="btn" type="button" :disabled="locBusy" @click="closeLoc">{{ $t('common.cancel') }}</button>
          <button class="btn btn-gold" type="button" :disabled="locBusy || !locChanged" @click="confirmLoc">
            <i class="la la-exchange"></i>{{ editing ? $t('editor.locMoveBtn') : $t('common.confirm') }}
          </button>
        </div>
      </div>
      <label class="tk-field">
        <span>{{ $t('editor.fieldTitle') }}</span>
        <input ref="sumInput" v-model="form.title" type="text" :placeholder="$t('editor.titlePh')" @keydown.enter="onTitleEnter" />
      </label>
      <!-- 链接：胶囊右侧按钮可编辑，末尾 + 可新增 -->
      <div class="tk-links">
        <span class="tk-links-label">{{ $t('editor.links') }}</span>
        <span v-for="(l, i) in form.links" :key="i" class="tk-link-chip">
          <a class="tk-link-chip-text" :href="l.url" target="_blank" rel="noopener noreferrer">{{ l.text || l.url }}</a>
          <button class="tk-link-edit" type="button" :title="$t('modals.linkEdit')" @click="openLinkEditor(i)">
            <i class="la la-pencil"></i>
          </button>
        </span>
        <button class="tk-add-mini" type="button" :title="$t('modals.linkAdd')" @click="openLinkEditor(-1)">
          <i class="la la-plus"></i>
        </button>
      </div>
      <!-- 标签：胶囊右侧 × 可删除，末尾 + 可新增 -->
      <div class="tk-links">
        <span class="tk-links-label">{{ $t('editor.tags') }}</span>
        <span v-for="(tag, i) in form.tags" :key="tag" class="tk-tag-chip">
          <span class="tk-tag-text">#{{ tag }}</span>
          <button class="tk-tag-del" type="button" :title="$t('editor.delTag')" @click="removeTag(i)">
            <i class="la la-times"></i>
          </button>
        </span>
        <span v-if="addingTag" class="tk-tag-chip is-editing">
          <input ref="tagInput" v-model="tagDraft" class="tk-tag-input" type="text" :placeholder="$t('editor.tagName')"
                 @keydown.enter="onTagEnter" @keydown.esc="onTagEsc" @blur="commitTag" />
        </span>
        <button v-else class="tk-add-mini" type="button" :title="$t('editor.addTag')" @click="startAddTag">
          <i class="la la-plus"></i>
        </button>
      </div>
      <label class="tk-field">
        <span>{{ $t('editor.desc') }}</span>
        <textarea v-model="form.description" rows="3" :placeholder="$t('editor.descPh')"></textarea>
      </label>
      <!-- 时间形态：单时间 / 时间段 / 全天 / 跨日期；各形态仅展示所需字段 -->
      <div class="tk-time-block">
        <div class="tk-tm-tabs">
          <button type="button" class="tk-tm-tab" :class="{ active: form.timeMode === 'single' }" @click="setTimeMode('single')">{{ $t('editor.timeSingle') }}</button>
          <button type="button" class="tk-tm-tab" :class="{ active: form.timeMode === 'range' }" @click="setTimeMode('range')">{{ $t('editor.timeRange') }}</button>
          <button type="button" class="tk-tm-tab" :class="{ active: form.timeMode === 'allday' }" @click="setTimeMode('allday')">{{ $t('app.allDay') }}</button>
          <button type="button" class="tk-tm-tab" :class="{ active: form.timeMode === 'crossdate' }" @click="setTimeMode('crossdate')">{{ $t('editor.crossDate') }}</button>
        </div>

        <!-- 单时间：日期 + 时间 -->
        <template v-if="form.timeMode === 'single'">
          <label class="tk-field">
            <span>{{ $t('editor.date') }}</span>
            <DatePicker v-model="form.dueDate" :disabled="saving" @change="onDateChange" />
          </label>
          <div class="tk-time-row">
            <TimePicker v-model="form.dueTime" :disabled="saving" :step="timeStep" placeholder="HH:MM" />
          </div>
        </template>

        <!-- 时间段：日期 + 开始时间 + 结束时间 -->
        <template v-else-if="form.timeMode === 'range'">
          <label class="tk-field">
            <span>{{ $t('editor.date') }}</span>
            <DatePicker v-model="form.dueDate" :disabled="saving" @change="onDateChange" />
          </label>
          <div class="tk-time-row">
            <TimePicker v-model="form.dueStart" :disabled="saving" :max="form.dueEnd" :step="timeStep" placeholder="开始" />
            <span class="tk-tm-sep">—</span>
            <TimePicker v-model="form.dueEnd" :disabled="saving" :min="form.dueStart" :step="timeStep" placeholder="结束" />
          </div>
        </template>

        <!-- 全天：日期 -->
        <template v-else-if="form.timeMode === 'allday'">
          <label class="tk-field">
            <span>{{ $t('editor.date') }}</span>
            <DatePicker v-model="form.dueDate" :disabled="saving" @change="onDateChange" />
          </label>
        </template>

        <!-- 跨日期：开始日期 + 结束日期 -->
        <template v-else-if="form.timeMode === 'crossdate'">
          <label class="tk-field">
            <span>{{ $t('editor.startDate') }}</span>
            <DatePicker v-model="form.startDate" :disabled="saving" @change="ensureDefaultTimes" />
          </label>
          <label class="tk-field">
            <span>{{ $t('editor.endDate') }}</span>
            <DatePicker v-model="form.dueDate" :disabled="saving" @change="ensureDefaultTimes" />
          </label>
        </template>
      </div>
      <div v-if="editing" class="tk-sub">
        <div class="tk-sub-title">{{ $t('editor.subtasks') }}</div>
        <subtask-list :task-guid="liveTask ? liveTask.guid : ''" @change="$emit('subtasks-changed', $event)" />
      </div>
      <div v-if="error" class="tk-err">{{ error }}</div>
      <!-- 优先级：置于表单最下方 -->
      <label class="tk-field">
        <span>{{ $t('editor.priority') }}</span>
        <div class="tk-prio-sel">
          <button v-for="opt in priorityOptions" :key="opt.level" type="button"
            class="tk-prio-opt" :class="['lvl-' + opt.level, { 'prio-on': form.priority === opt.level }]"
            @click="form.priority = opt.level">
            <span v-if="opt.icon" class="tk-prio-ico">{{ opt.icon }}</span>{{ opt.label }}
          </button>
        </div>
      </label>
      <!-- 底栏：左（状态操作 + 删除）· 右（唯一主按钮） -->
      <div class="tk-modal-ops">
        <template v-if="editing">
          <button v-if="!form.completed" class="btn" type="button" :disabled="saving" @click="completeTask">
            <i class="la la-check"></i>{{ $t('editor.doneBtn') }}
          </button>
          <button v-else class="btn" type="button" :disabled="saving" @click="completeTask">
            <i class="la la-undo"></i>{{ $t('editor.markUndoneBtn') }}
          </button>
          <button v-if="!form.cancelled" class="btn" type="button" :disabled="saving" @click="cancelTask">
            <i class="la la-ban"></i>{{ $t('editor.cancelTaskBtn') }}
          </button>
          <button v-else class="btn" type="button" :disabled="saving" @click="cancelTask">
            <i class="la la-undo"></i>{{ $t('editor.restoreTaskBtn') }}
          </button>
          <button class="btn btn-danger" type="button" :disabled="saving" @click="remove">
            <i class="la la-trash"></i>{{ $t('editor.delTask') }}
          </button>
        </template>
        <span class="spacer"></span>
        <button class="btn btn-gold" :disabled="saving || !form.title.trim()" @click="save()">
          <i class="la la-save"></i>{{ saving ? $t('editor.saving') : $t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { Tasks } from '../composables/useTasks.js';
import { splitSummary, composeSummary, sanitizeTag, isImeKey, INBOX_KEY, PRIORITY_ICON, priorityToLevel, levelToPriorityEmoji } from '../composables/tasks-logic.js';
import { taskFilePath } from '../api/tasks.js';
import { LinkFormModal, ConfirmModal } from '../ui/modals.js';
import { openTaskInFile } from '../utils/openTaskInFile.js';
import SubtaskList from './SubtaskList.vue';
import TimePicker from './TimePicker.vue';
import DatePicker from './DatePicker.vue';

const pad = (n) => (n < 10 ? '0' + n : '' + n);
// 日期键（日记文件）：YYYY-MM-DD。清单 / 收件箱都不是日期键
const isDateKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(String(k || ''));
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

export default {
  name: 'TaskEditorModal',
  components: { SubtaskList, TimePicker, DatePicker },
  props: {
    open: { type: Boolean, default: false },
    task: { type: Object, default: null },
    defaultDate: { type: String, default: '' },
    // 双击时间轴空白格新建：预填开始时刻（HH:MM），落到对应时间
    defaultTime: { type: String, default: '' },
    // VueModal 桥挂载的独立 app 拿不到全局 plugin，显式传入（打开原生链接弹窗用）
    plugin: { type: Object, default: null },
    // 清单分组内新建：传入 { list, group } 时，新任务追加到该分组最后一行（而非文件末尾）
    createIn: { type: Object, default: null },
    // 四象限新建：预置优先级档位（high / medium / low / none），使新任务落入对应象限
    defaultPriority: { type: String, default: '' },
    // 清单列表：编辑器「归属」下拉的选项源（父级已加载，免重复读盘）；为空时自己兜底拉一次
    checklists: { type: Array, default: () => [] }
  },
  data() {
    return {
      form: this.blank(),
      saving: false,
      error: '',
      // 当前编辑的链接下标（< 0 表示新增）
      linkEditIndex: -1,
      // 新增标签
      addingTag: false,
      tagDraft: '',
      /* ---------- 归属（所在清单 / 分组） ---------- */
      // 本地任务镜像：移动后 guid / file / date 都会变，保存与「打开源文件」都以它为准
      liveTask: null,
      inboxKey: INBOX_KEY,
      locKey: '',            // 当前归属：inbox / cl:xxx / 日期串；新建时 '' = 按日期自动
      locGroup: '',          // 分组标题（'' = 未分组）
      origLocKey: '',        // 落盘后的真实归属，用来判断「是否有未确认的改动」
      origLocGroup: '',
      locPath: '',           // 归属文件路径（chip tooltip）
      locListName: '',       // 清单显示名
      groupOptions: [],      // 当前归属文件的 ### 分组（不含未分组）
      rawGroups: [],         // 同上但带任务，用于反查当前任务所在分组
      locBusy: false,        // 移动请求进行中（防连点）
      locOpen: false,        // 下拉浮层是否展开
      dKey: '',              // 浮层里的清单草稿（确认前不影响真实归属）
      dGroup: '',            // 浮层里的分组草稿
      locPopStyle: {},       // 浮层绝对定位
      locError: '',          // 移动失败原因（留在浮层里展示）
      localLists: []         // checklists prop 为空时的兜底清单列表
    };
  },
  computed: {
    editing() { return !!(this.liveTask && this.liveTask.guid); },
    // 时间形态三态（allday / single / range）中，是否全天
    isAllDay() { return this.form.timeMode === 'allday'; },
    // 时间选择器步长：取自插件设置（timeStep），取不到时默认 5（分钟）
    timeStep() { return (this.plugin && this.plugin.settings && this.plugin.settings.timeStep) || 5; },
    isCrossDate() { return this.form.timeMode === 'crossdate'; },
    // 子任务不放「归属」：把子任务搬离父任务会破坏层级，这类整理在父任务层面做
    showLoc() { return !(this.liveTask && this.liveTask.indent > 0); },
    // 归属下拉选项源：优先用父级传入的清单列表，没有时用自己兜底拉取的
    assignLists() { return (this.checklists && this.checklists.length) ? this.checklists : this.localLists; },
    // 浮层里的清单草稿：只有收件箱 / 清单才有 ### 分组可选；「按日期自动」「日记」没有
    locCanPickGroups() { return !!this.dKey && !isDateKey(this.dKey); },
    // 当前实际归属是日记：作为「原位」选项列出来（选中=不移动）
    locIsOrigDate() { return isDateKey(this.locKey); },
    // 当前清单不在清单列表里（文件被删 / 改名后 metadataCache 未刷新）：仍保留原位选项，避免下拉空白
    locOrphan() {
      if (!this.locKey || this.locKey === INBOX_KEY || isDateKey(this.locKey)) return false;
      return !this.assignLists.some((x) => x.key === this.locKey);
    },
    // 草稿分组在目标文件里已不存在（被改名/删除）：仍列出来，避免下拉空白
    locGroupMissing() { return !!this.dGroup && !this.groupOptions.includes(this.dGroup); },
    // 浮层里有未确认的改动（没改就不让点「移动」）
    locChanged() { return this.dKey !== this.locKey || this.dGroup !== this.locGroup; },
    locIcon() {
      if (!this.locKey) return 'la-clock-o';
      if (this.locKey === INBOX_KEY) return 'la-inbox';
      if (isDateKey(this.locKey)) return 'la-calendar';
      return 'la-folder-o';
    },
    // chip 文案：收件箱 / 清单 · 名字 / 日记 · 2026-10-29，后面再接 « › 分组 »
    locChipText() { return this.locBaseText() + (this.locGroup ? ' › ' + this.locGroup : ''); },
    // chip 提示：说明可点 + 真实文件路径
    locTip() {
      const tip = this.$t('editor.locMoveTip');
      return this.locPath ? tip + '\n' + this.$t('editor.locTip', { path: this.locPath }) : tip;
    },
    // 优先级四档（高 / 中 / 低 / 无，从左到右），图标取自 obsidian-tasks 风格；默认「无」
    priorityOptions() {
      return [
        { level: 'high', icon: PRIORITY_ICON.high, label: this.$t('editor.prioHigh') },
        { level: 'medium', icon: PRIORITY_ICON.medium, label: this.$t('editor.prioMedium') },
        { level: 'low', icon: PRIORITY_ICON.low, label: this.$t('editor.prioLow') },
        { level: 'none', icon: '', label: this.$t('editor.prioNone') }
      ];
    }
  },
  watch: {
    // immediate：VueModal 桥挂载时 open 已为 true，必须立即初始化预填表单
    open: { handler(v) { if (v) this.init(); }, immediate: true }
  },
  // 弹窗可能在浮层打开时被遮罩/Esc 关掉：卸载时务必摘掉全局监听，避免泄漏
  beforeUnmount() {
    if (typeof document !== 'undefined') document.removeEventListener('keydown', this.onLocEsc, true);
  },
  methods: {
    blank() {
      return {
        guid: '', title: '', description: '', links: [], tags: [],
        dueDate: this.defaultDate || '', dueTime: this.defaultTime || '',
        timeMode: 'single', dueStart: this.defaultTime || '', dueEnd: '', startDate: '',
        remind: true, completed: false, cancelled: false, cancelledAt: '',
        priority: this.defaultPriority || 'none'
      };
    },
    init() {
      this.error = '';
      this.saving = false;
      this.linkEditIndex = -1;
      this.addingTag = false;
      this.tagDraft = '';
      // 本地镜像：后续移动会换 guid，保存 / 打开文件都基于它，而不是原始 prop
      this.liveTask = this.task ? Object.assign({}, this.task) : null;
      this.form = this.editing ? this.taskToForm(this.liveTask) : this.blank();
      // 新建且未指定时间时，带出下一个准点/半点（结束=开始+30 分）
      this.ensureDefaultTimes();
      this.initLoc();
      this.$nextTick(() => { if (this.$refs.sumInput) this.$refs.sumInput.focus(); });
    },
    // 标题只取纯文字，链接与标签拆成独立字段各自维护
    taskToForm(t) {
      let dueDate = '', dueTime = '', timeMode = 'single', dueStart = '', dueEnd = '', startDate = '';
      const sd = t.dueAt ? new Date(t.dueAt) : null;
      const ed = (t.dueEndAt && !t.dueAllDay) ? new Date(t.dueEndAt) : null;
      const startMs = (t.startAt != null) ? Number(t.startAt) : null;
      const cross = sd && startMs != null && ymd(new Date(startMs)) !== ymd(sd);
      if (cross) {
        timeMode = 'crossdate';
        startDate = ymd(new Date(startMs));
        dueDate = ymd(sd);
      } else if (sd) {
        dueDate = ymd(sd);
        if (t.dueAllDay) {
          timeMode = 'allday';
        } else {
          dueTime = pad(sd.getHours()) + ':' + pad(sd.getMinutes());
        }
      }
      if (ed && !cross) {
        timeMode = 'range';
        dueStart = pad(sd.getHours()) + ':' + pad(sd.getMinutes());
        dueEnd = pad(ed.getHours()) + ':' + pad(ed.getMinutes());
      }
      const parts = splitSummary(t.summary);
      return {
        guid: t.guid,
        title: parts.title,
        description: t.description || '',
        links: parts.links.slice(),
        tags: parts.tags.slice(),
        dueDate, dueTime, timeMode, dueStart, dueEnd, startDate,
        remind: t.remind !== false,
        completed: !!t.completed,
        cancelled: !!t.cancelled,
        cancelledAt: t.cancelledAt || '',
        priority: priorityToLevel(t.priority)
      };
    },
    /* ---------- 归属（清单 / 分组）：整理收件箱任务的主要入口 ---------- */
    // chip 基础文案（不含分组）
    locBaseText() {
      if (!this.locKey) return this.$t('editor.locAuto');
      if (this.locKey === INBOX_KEY) return this.$t('editor.locInbox');
      if (isDateKey(this.locKey)) return this.$t('editor.locDiary', { date: this.locKey });
      return this.$t('editor.locList', { name: this.locListName || String(this.locKey).replace(/^cl:/, '').split('/').pop() });
    },
    listNameOf(key) {
      if (!key || key === INBOX_KEY || isDateKey(key)) return '';
      const c = this.assignLists.find((x) => x.key === key);
      // 兜底：清单列表里还没有它（刚建好 / metadataCache 未刷新）时，用路径末段当显示名
      return c ? c.name : String(key).replace(/^cl:/, '').split('/').pop();
    },
    // 初始化归属：编辑 → 反查当前分组；新建 → 沿用清单视图「分组 +」传入的 createIn
    async initLoc() {
      this.groupOptions = [];
      this.rawGroups = [];
      // checklists prop 为空（如从某处独立打开）时兜底拉一次，避免下拉里没有可选清单
      if (!(this.checklists && this.checklists.length)) {
        try { this.localLists = await Tasks.loadChecklists(); } catch (e) { this.localLists = []; }
      }
      const t = this.liveTask;
      if (t) {
        this.locKey = t.date || INBOX_KEY;
        this.locPath = t.file || taskFilePath(this.locKey) || '';
        this.locListName = this.listNameOf(this.locKey);
        this.origLocKey = this.locKey;
        this.origLocGroup = '';
        this.locGroup = '';
        if (this.locKey && !isDateKey(this.locKey)) {
          await this.loadGroupOptions(this.locKey);
          this.locGroup = this.groupOfGuid(t.guid);
          this.origLocGroup = this.locGroup;
        }
        this.dKey = this.locKey;
        this.dGroup = this.locGroup;
        return;
      }
      const ci = this.createIn;
      this.locKey = (ci && ci.list) ? ci.list : '';
      this.locGroup = (ci && ci.group) ? ci.group : '';
      this.locPath = this.locKey ? (taskFilePath(this.locKey) || '') : '';
      this.locListName = this.listNameOf(this.locKey);
      this.origLocKey = this.locKey;
      this.origLocGroup = this.locGroup;
      this.dKey = this.locKey;
      this.dGroup = this.locGroup;
      if (this.locKey && !isDateKey(this.locKey)) await this.loadGroupOptions(this.locKey);
    },
    // 读取目标文件的分组（收件箱 / 清单同一套 ### 规则）；key 缺省用当前实际归属
    async loadGroupOptions(key) {
      const k = key || this.locKey;
      if (!k || isDateKey(k)) { this.groupOptions = []; this.rawGroups = []; return; }
      try {
        const r = k === INBOX_KEY
          ? await Tasks.loadInboxGroups()
          : await Tasks.loadChecklistGroups(k);
        this.rawGroups = (r && r.groups) || [];
        this.groupOptions = this.rawGroups
          .map((g) => g.title)
          .filter((x) => x && String(x).trim());
      } catch (e) {
        this.rawGroups = [];
        this.groupOptions = [];
      }
    },
    // 当前任务落在哪个分组（未分组 = ''）
    // 同一任务在不同加载器下的 guid 可能带 / 不带文件段（dateKey#lineNo[#file]），按前两段比较
    groupOfGuid(guid) {
      const norm = (g) => String(g || '').split('#').slice(0, 2).join('#');
      const key = norm(guid);
      const hit = this.rawGroups.find((g) => (g.tasks || []).some((x) => norm(x.guid) === key));
      return hit ? (hit.title || '') : '';
    },
    /* ---------- 归属下拉浮层（当前页完成，确认即移动） ---------- */
    toggleLoc() {
      if (this.locOpen) { this.closeLoc(); return; }
      this.openLoc();
    },
    openLoc() {
      if (this.locBusy) return;
      // 每次展开都从「当前真实归属」开始，未确认的草稿不残留
      this.dKey = this.locKey;
      this.dGroup = this.locGroup;
      this.locError = '';
      this.locOpen = true;
      this.positionLoc();
      this.loadGroupOptions(this.dKey).then(() => this.positionLoc());
      // Esc 先收浮层（阻止冒泡，避免直接把整个编辑弹窗关掉）
      if (typeof document !== 'undefined') document.addEventListener('keydown', this.onLocEsc, true);
    },
    closeLoc() {
      this.locOpen = false;
      this.locError = '';
      this.dKey = this.locKey;
      this.dGroup = this.locGroup;
      if (typeof document !== 'undefined') document.removeEventListener('keydown', this.onLocEsc, true);
    },
    onLocEsc(e) {
      if (!this.locOpen) return;
      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        this.closeLoc();
      }
    },
    // 浮层贴在 chip 下方：chip 在头部（顶部），向下展开不会超出弹窗可视区；宽度固定避免抖动
    positionLoc() {
      const chip = this.$refs.locChip;
      const modal = this.$refs.modalEl;
      if (!chip || !modal || typeof chip.getBoundingClientRect !== 'function') return;
      const c = chip.getBoundingClientRect();
      const m = modal.getBoundingClientRect();
      const w = 300;
      const left = Math.max(12, Math.min(c.left - m.left, m.width - w - 22));
      const top = c.bottom - m.top + (modal.scrollTop || 0) + 6;
      this.locPopStyle = { width: w + 'px', left: Math.round(left) + 'px', top: Math.round(top) + 'px' };
    },
    // 点主弹窗其它位置收起浮层（chip 与浮层内部除外）
    onModalClick(e) {
      if (!this.locOpen) return;
      const pop = this.$refs.locPop;
      const chip = this.$refs.locChip;
      if (pop && pop.contains && pop.contains(e.target)) return;
      if (chip && chip.contains && chip.contains(e.target)) return;
      this.closeLoc();
    },
    // 换清单：分组回「未分组」；选回原位则恢复当前分组，避免误移动
    async onDraftListChange() {
      this.dGroup = this.dKey === this.locKey ? this.locGroup : '';
      await this.loadGroupOptions(this.dKey);
    },
    // 点「移动 / 确定」：编辑态立即落盘（失败留在浮层里报错）；新建态只记录目标，保存时创建
    async confirmLoc() {
      if (this.locBusy || !this.locChanged) return;
      const target = { key: this.dKey || '', group: this.dGroup || '' };
      if (!this.editing) {
        this.locKey = target.key;
        this.locGroup = target.group;
        this.locPath = target.key ? (taskFilePath(target.key) || '') : '';
        this.locListName = this.listNameOf(target.key);
        this.closeLoc();
        return;
      }
      // 连点时不重复发起（上一次还没落盘）
      if (!target.key || isDateKey(target.key)) { this.closeLoc(); return; }
      this.locBusy = true;
      this.locError = '';
      try {
        // keepDate：改「归属」不应该顺手清掉日期；日记任务的日期会被物化成行内标记
        const r = await Tasks.moveTaskToGroup(this.liveTask.guid, target.key, target.group, { keepDate: true });
        const nt = (r && r.task) || {};
        this.liveTask = Object.assign({}, this.liveTask, nt, {
          guid: nt.guid || this.liveTask.guid,
          date: target.key,
          file: nt.file || taskFilePath(target.key) || this.liveTask.file
        });
        this.form.guid = this.liveTask.guid;
        this.locKey = target.key;
        this.locGroup = target.group;
        this.origLocKey = target.key;
        this.origLocGroup = target.group;
        this.locPath = this.liveTask.file || '';
        this.locListName = this.listNameOf(target.key);
        this.closeLoc();
        // 通知父级刷新清单统计 / 当前视图（任务可能已经不在原来的清单里）
        this.$emit('moved');
      } catch (e) {
        // 失败留在浮层里展示原因，位置不变
        this.locError = this.$t('editor.moveFail') + ((e && e.reason) || (e && e.message) || e);
      } finally {
        this.locBusy = false;
      }
    },
    // 下一个准点或半点：向上取整到 30 分钟边界（如 09:12 → 09:30，09:40 → 10:00）
    nextHalfHour() {
      const now = new Date();
      const total = now.getHours() * 60 + now.getMinutes();
      let next = Math.ceil(total / 30) * 30;
      if (next >= 1440) next = 1410; // 封顶 23:30
      const hh = Math.floor(next / 60), mm = next % 60;
      return {
        start: pad(hh) + ':' + pad(mm),
        end: pad(Math.floor((next + 30) / 60) % 24) + ':' + pad((next + 30) % 60)
      };
    },
    // HH:mm 加 add 分钟，按天取模
    addMinutes(hhmm, add) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
      let total = m ? Number(m[1]) * 60 + Number(m[2]) : 9 * 60;
      total = (total + add) % (24 * 60);
      return pad(Math.floor(total / 60)) + ':' + pad(total % 60);
    },
    // HH:mm → 当日分钟数；非法返回默认 9:00
    toMin(hhmm) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
      return m ? Number(m[1]) * 60 + Number(m[2]) : 9 * 60;
    },
    // 把 HH:mm 向上取整到「下一个整点 / 半点」边界（如 09:12→09:30，09:40→10:00）
    ceilHalfHour(hhmm) {
      const total = this.toMin(hhmm);
      let next = Math.ceil(total / 30) * 30;
      if (next >= 1440) next = 1410; // 封顶 23:30
      return pad(Math.floor(next / 60)) + ':' + pad(next % 60);
    },
    // 未指定时间时，按模式带出默认值（单时间→下一个半点；时间段→开始为下一个半点、结束+30 分）
    ensureDefaultTimes() {
      if (this.isAllDay) return;
      if (this.form.timeMode === 'crossdate') {
        if (!this.form.startDate) this.form.startDate = this.form.dueDate || '';
        return;
      }
      if (this.form.timeMode === 'range') {
        if (!this.form.dueStart) {
          const d = this.nextHalfHour();
          this.form.dueStart = this.form.dueTime || d.start;
          this.form.dueEnd = this.form.dueEnd || d.end;
        }
      } else if (!this.form.dueTime) {
        this.form.dueTime = this.form.dueStart || this.nextHalfHour().start;
      }
    },
    onDateChange() { this.ensureDefaultTimes(); },
    // 全天 / 单时间 / 时间段 切换：同一单选项，切换时按模式补默认值
    setTimeMode(mode) {
      if (this.form.timeMode === mode) return;
      this.form.timeMode = mode;
      this.ensureDefaultTimes();
    },
    // 构造时间戳：单时间只给开始；时间段额外给结束；全天只给当日 00:00
    buildDueAt() {
      if (!this.form.dueDate) return { dueAt: null, dueEndAt: null };
      const date = this.form.dueDate;
      if (this.isAllDay) return { dueAt: new Date(date + 'T00:00:00').getTime(), dueEndAt: null };
      if (this.isCrossDate) {
        const end = this.form.dueDate;
        const s = this.form.startDate;
        const dueAt = end ? new Date(end + 'T00:00:00').getTime() : null;
        // 开始日不得晚于结束日，否则回退为与结束日相同的单日
        const startAt = (s && end && s <= end)
          ? new Date(s + 'T00:00:00').getTime()
          : dueAt;
        return { dueAt, dueEndAt: null, startAt, dueAllDay: true };
      }
      let start, end = null;
      if (this.form.timeMode === 'range') {
        start = this.form.dueStart || this.nextHalfHour().start;
        end = this.form.dueEnd || this.addMinutes(start, 30);
      } else {
        start = this.form.dueTime || this.nextHalfHour().start;
      }
      const dueAt = new Date(date + 'T' + start).getTime();
      const dueEndAt = end ? new Date(date + 'T' + end).getTime() : null;
      return { dueAt, dueEndAt };
    },
    // opts.cancelled 存在时同时写入取消态（「取消任务/恢复任务」按钮直达）
    async save(opts) {
      // keydown 阶段触发，长按回车会连发：saving 锁防重复创建
      if (this.saving) return;
      const title = (this.form.title || '').trim();
      if (!title) return;
      // 时间段：结束须晚于开始，否则提示并阻止保存（不再静默吸附，避免改期被悄悄改写）
      if (this.form.timeMode === 'range' && this.form.dueStart && this.form.dueEnd
          && this.toMin(this.form.dueEnd) <= this.toMin(this.form.dueStart)) {
        this.error = this.$t('editor.endAfterStart');
        return;
      }
      this.saving = true; this.error = '';
      const { dueAt, dueEndAt, startAt } = this.buildDueAt();
      const payload = {
        // 存盘时还原为完整 Markdown：标题 | [链接](地址) | #标签（提醒关闭时追加 🔕 标记）
        summary: composeSummary(title, this.form.links, this.form.tags, { mute: !this.form.remind }),
        description: this.form.description || '',
        dueAt,
        dueEndAt,
        startAt,
        dueAllDay: this.isAllDay || this.isCrossDate,
        priority: levelToPriorityEmoji(this.form.priority)
      };
      if (this.editing) {
        payload.completed = this.form.completed;
        payload.cancelled = (opts && opts.cancelled !== undefined) ? opts.cancelled : this.form.cancelled;
      }
      try {
        const saved = this.editing
          ? await Tasks.updateTask(this.form.guid, payload)
          : (this.locKey
              // 归属已指定（收件箱 / 某个清单）：直接建到该文件的分组
              ? await Tasks.createChecklistTask(this.locKey, this.locGroup || '', payload)
              : (this.createIn
                  ? await Tasks.createChecklistTask(this.createIn.list, this.createIn.group, payload)
                  : await Tasks.createTask(payload)));
        this.$emit('saved', saved);
        this.close();
      } catch (e) {
        this.error = (this.editing ? this.$t('app.saveFail') : this.$t('app.createFail')) + (e && e.message || e);
      } finally {
        this.saving = false;
      }
    },
    // 取消任务 / 恢复任务：一键写回当前表单内容并切换取消态，成功后关闭弹窗
    cancelTask() {
      if (this.saving) return;
      this.form.cancelled = !this.form.cancelled;
      this.save({ cancelled: this.form.cancelled });
    },
    // 完成 / 标记未完成：一键写回并切换完成态（✅ 自动记录当天日期），成功后关闭弹窗
    completeTask() {
      if (this.saving) return;
      this.form.completed = !this.form.completed;
      if (this.form.completed) this.form.cancelled = false; // 完成视为恢复，清除取消态
      this.save({ completed: this.form.completed });
    },
    remove() {
      if (!this.form.guid || this.saving) return;
      new ConfirmModal(this.plugin ? this.plugin.app : null, {
        title: this.$t('editor.delTitle'),
        message: this.$t('editor.delMsg', { name: this.form.title || this.$t('editor.thatTask') }),
        confirmText: this.$t('common.delete'),
        danger: true,
        onConfirm: () => this.doRemove()
      }).open();
    },
    async doRemove() {
      this.saving = true;
      try {
        await Tasks.deleteTask(this.form.guid);
        this.$emit('deleted', this.form.guid);
        this.close();
      } catch (e) {
        this.error = this.$t('app.delFail') + (e && e.message || e);
      } finally {
        this.saving = false;
      }
    },
    /* ---------- 打开任务所在的笔记，并高亮定位到任务所在行 ---------- */
    async openFile() {
      await openTaskInFile(this.plugin, this.liveTask);
      this.close();
    },
    /* ---------- 链接（原生弹窗；index < 0 表示新增） ---------- */
    openLinkEditor(index) {
      const links = this.form.links;
      new LinkFormModal(this.plugin ? this.plugin.app : null, {
        link: index >= 0 ? (links[index] || null) : null,
        onSave: (item) => {
          // Vue3：直接赋值（Proxy 响应式）
          if (index >= 0) links[index] = item;
          else links.push(item);
        },
        onDelete: () => {
          if (index >= 0) links.splice(index, 1);
        }
      }).open();
    },

    /* ---------- 标签 ---------- */
    startAddTag() {
      this.addingTag = true;
      this.tagDraft = '';
      this.$nextTick(() => { const el = this.$refs.tagInput; if (el) el.focus(); });
    },
    cancelAddTag() {
      this.addingTag = false;
      this.tagDraft = '';
    },
    commitTag() {
      if (!this.addingTag) return;
      const name = sanitizeTag(this.tagDraft);
      if (name && this.form.tags.indexOf(name) < 0) this.form.tags.push(name);
      this.addingTag = false;
      this.tagDraft = '';
    },
    removeTag(i) {
      this.form.tags.splice(i, 1);
    },
    /* ---------- 键盘：输入法组字期间的回车 / esc 不算快捷键 ---------- */
    // 标题回车 = 保存；中文输入法按回车是「上屏候选词」，那一下必须放行
    onTitleEnter(e) {
      if (isImeKey(e)) return;
      this.save();
    },
    onTagEnter(e) {
      if (isImeKey(e)) return;
      this.commitTag();
    },
    onTagEsc(e) {
      if (isImeKey(e)) return;
      this.cancelAddTag();
    },
    close() { this.$emit('update:open', false); }
  }
};
</script>

<style scoped>
/* 表单原语（.tk-field/.btn 等）在全局弹窗样式 task-modal.css 中 */
/* 提权到 .tk-modal：避免被 tasks-shared.css 的 .task-app .tk-check（20px 字号 + 18px 宽高）覆盖 */
.tk-modal .tk-check { display: flex; align-items: center; gap: 7px; width: 100%; height: auto; font-size: 13px; line-height: 1.6; color: var(--ink-soft); margin: 2px 0 16px; cursor: pointer; }
/* 时间区：全天开关 + 单/时间段切换 + 选择器，纵向排布 */
.tk-time-block { display: flex; flex-direction: column; gap: 10px; margin: 2px 0 16px; }
.tk-time-block .tk-check { margin: 0; }
/* 单时间 / 时间段 简单 tab 切换 */
.tk-tm-tabs { display: inline-flex; align-self: flex-start; background: var(--background-modifier-hover); border-radius: 8px; padding: 2px; gap: 2px; }
.tk-tm-tab {
  border: none; background: transparent; color: var(--ink-soft);
  font-family: inherit; font-size: 13px; line-height: 1.4;
  padding: 5px 14px; border-radius: 6px; cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.tk-tm-tab:hover { color: var(--ink); }
.tk-tm-tab.active { background: var(--panel); color: var(--gold); font-weight: 700; box-shadow: 0 1px 2px rgba(0,0,0,.15); }
/* 时间输入行：原生 date/time 选择器，对齐 .tk-field 表单原语 */
.tk-time-row { display: flex; align-items: center; gap: 8px; }
.tk-time-row input {
  border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px;
  font-family: inherit; font-size: 14px; color: var(--ink); background: var(--panel);
  color-scheme: dark light;
}
.tk-time-row input:focus { outline: none; border-color: var(--gold); }
.tk-tm-sep { flex: none; color: var(--ink-soft); font-weight: 700; }
.tk-ic { font-size: 14px; color: var(--ink-soft); }
.tk-ic.la-check-circle-o { color: var(--gold); }
.tk-sub { margin: 4px 0 16px; padding-top: 14px; border-top: 1px dashed var(--line); }
.tk-sub-title { font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 6px; }

/* 标题下方的链接 / 标签行 */
.tk-links { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 10px; }
.tk-links-label { flex: none; width: 28px; font-size: 12px; color: var(--ink-soft); }

/* 行末「+ 新增」小圆钮（提权同上，避免被 tasks-shared.css 覆盖尺寸） */
.tk-modal .tk-add-mini {
  flex: none; width: 22px; height: 22px; border: 1px dashed var(--line); border-radius: 50%;
  background: transparent; color: var(--ink-soft); font-size: 11px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.tk-add-mini:hover { background: var(--gold-bg); color: var(--gold); border-color: var(--gold); }

/* 标签胶囊：× 删除 */
.tk-tag-chip {
  display: inline-flex; align-items: center; gap: 2px;
  padding: 1px 2px 1px 10px; border-radius: 999px;
  background: var(--tag-bg);
  color: var(--tag-ink);
  font-size: 12px; line-height: 20px;
}
.tk-tag-text { white-space: nowrap; }
.tk-tag-del {
  flex: none; width: 18px; height: 18px; border: none; border-radius: 50%;
  background: transparent; color: inherit; font-size: 10px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  opacity: .6; transition: opacity .15s ease, background .15s ease;
}
.tk-tag-del:hover { opacity: 1; background: var(--background-modifier-hover); }
.tk-tag-chip.is-editing { padding: 1px 8px; }
.tk-tag-input {
  width: 88px; border: none; background: transparent; padding: 0;
  font: inherit; font-size: 12px; color: inherit; box-shadow: none;
}
.tk-tag-input:focus { outline: none; box-shadow: none; }
.tk-tag-input::placeholder { color: var(--ink-soft); }
.tk-link-chip {
  display: inline-flex; align-items: center; gap: 2px; max-width: 100%;
  padding: 1px 2px 1px 10px;
  border: 1px solid var(--line); border-radius: 999px; background: var(--panel);
}
.tk-link-chip-text {
  max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--gold); font-size: 13px;
  text-decoration: underline; text-underline-offset: 2px;
}
.tk-link-edit {
  flex: none; width: 22px; height: 22px; border: none; border-radius: 50%;
  background: transparent; color: var(--ink-soft); font-size: 11px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background .15s ease, color .15s ease;
}
.tk-link-edit:hover { background: var(--gold-bg); color: var(--gold); }
/* ---------- 头部：所在清单 chip（点击打开移动弹窗） ---------- */
.tk-loc-chip {
  flex: none; max-width: 220px; display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 9px; border-radius: 999px; cursor: pointer;
  background: transparent; border: 1px solid var(--line); color: var(--ink-soft);
  font-size: 12px; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.tk-loc-chip:hover { background: var(--gold-bg); border-color: var(--gold); color: var(--ink); }
.tk-loc-chip i { flex: none; font-size: 12px; color: var(--gold); }
.tk-loc-chip.on { background: var(--gold-bg); border-color: var(--gold); color: var(--ink); }
.tk-loc-caret { font-size: 10px !important; opacity: .65; margin-left: 1px; }
/* 归属下拉浮层：绝对定位在 chip 下方，只盖住表单、不参与布局（不会把保存按钮挤下去） */
.tk-loc-pop {
  position: absolute; z-index: 20; box-sizing: border-box;
  padding: 12px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--panel-2);
}
.tk-loc-pop .tk-field { margin-bottom: 8px; }
.tk-loc-pop .tk-field > span { font-size: 12px; }
.tk-loc-cur { margin: 0 0 10px; font-size: 12px; color: var(--ink-soft); }
.tk-loc-actions { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
.tk-loc-actions .spacer { flex: 1; }
.tk-loc-err { margin: 0 0 8px; padding: 8px 10px; font-size: 12px; }
</style>
