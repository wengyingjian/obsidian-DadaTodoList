<template>
  <div class="tk-clview">
    <!-- 左侧：清单列表（固定 260px） -->
    <aside class="tk-cl-side">
      <div class="tk-cl-side-h">
        <i class="la la-tasks"></i><span>{{ $t('app.viewCl') }}</span>
        <!-- 新建清单：只要名称；按钮位置与样式对齐清单内「分组 + / 新建任务」 -->
        <button class="tk-add cl-sadd" type="button" :title="$t('app.newChecklist')" @click="openNewChecklist">
          <i class="la la-plus-circle"></i>
        </button>
      </div>
      <div v-if="!lists.length" class="tk-cl-side-empty">{{ $t('app.clSideEmpty') }}</div>
      <!-- 眼睛开着（仅显示待办）且清单全被折叠：不留一句「还没有清单」的误导，直接给展开入口 -->
      <div v-else-if="!visibleLists.length" class="tk-cl-hidden tk-cl-hidden-all">
        <span>{{ $t('app.clHiddenDone', { n: hiddenCount }) }}</span>
        <button class="tk-cl-hidden-btn" type="button" @click="showAllLists">{{ $t('app.clShowAll') }}</button>
      </div>
      <template v-else>
        <div class="tk-cl-list">
          <div v-for="c in visibleLists" :key="c.key" class="tk-cl-item" :data-href="taskFilePath(c.key) || ''">
            <div class="tk-cl-item-main" :class="{ on: c.key === activeKey }"
                 role="button" tabindex="0"
                 @click="selectList(c.key)"
                 @keydown.enter.prevent="selectList(c.key)"
                 @keydown.space.prevent="selectList(c.key)">
              <div class="tk-cl-name">{{ c.name }}</div>
              <div class="tk-cl-bar"><i :style="{ width: pct(c) + '%' }"></i></div>
              <div class="tk-cl-meta">{{ $t('app.clProgressPct', { done: c.done, total: c.total, pct: pct(c) }) }}</div>
            </div>
            <button class="tk-cl-open" type="button" :title="$t('app.openChecklistFile')" @click.stop="openFile(c.key)">
              <i class="la la-external-link"></i>
            </button>
          </div>
        </div>
        <!-- 被折叠的已完成清单：始终留一行可点提示，避免用户以为清单被删 -->
        <div v-if="hiddenCount" class="tk-cl-hidden">
          <span>{{ $t('app.clHiddenDone', { n: hiddenCount }) }}</span>
          <button class="tk-cl-hidden-btn" type="button" @click="showAllLists">{{ $t('app.clShowAll') }}</button>
        </div>
      </template>
    </aside>

    <!-- 右侧：选中清单的任务（按 ### 标题分组） -->
    <section class="tk-cl-main">
      <div v-if="!activeKey" class="tk-cl-empty-main">{{ $t('app.clPickSide') }}</div>
      <template v-else>
        <header class="tk-cl-main-h">
          <div class="tk-cl-head-l">
            <div class="tk-cl-title">{{ activeName }}</div>
            <div class="tk-cl-prog">{{ $t('app.clProgress', { done: activeDone, total: activeTotal }) }}</div>
          </div>
        </header>

        <div v-if="loading" class="tk-cl-loading">{{ $t('app.loading') }}</div>
        <div v-else-if="error" class="tk-err">{{ error }}</div>
        <template v-else>
          <!-- 列表视图：分组纵向堆叠（默认，保留原样式） -->
          <div v-if="mainView === 'list'" class="tk-cl-body">
            <!-- 空态两种含义分开：真的没有任务 → 引导落第一个任务；眼睛开着且已无待办 → 说明并给「显示全部」入口 -->
            <div v-if="!visibleGroups.length" class="tk-cl-none tk-cl-none-add">
              <template v-if="activeTotal > 0 && pendingLeft === 0">
                <span>{{ $t('app.clNoPending') }}</span>
                <button class="tk-add cl-eadd" type="button" :title="$t('app.clShowAll')" @click="showAllLists">
                  <i class="la la-eye"></i>
                </button>
              </template>
              <template v-else>
                <span>{{ $t('app.clEmpty') }}</span>
                <button class="tk-add cl-eadd" type="button" :title="$t('app.addTask')" @click="openAdd({ title: '' })">
                  <i class="la la-plus-circle"></i>
                </button>
              </template>
            </div>
            <div v-for="g in visibleGroups" :key="gKey(g)" class="tk-cl-group"
                 :class="{ 'tk-cl-drophover': dragOverTitle === g.title }"
                 @dragover.prevent="onDragOver($event, g.title)" @drop="onDrop($event, g.title)">
              <div class="tk-cl-gtitle" :class="{ 'is-plain': !g.title }">
                <template v-if="g.title">
                  <span class="tk-cl-gtxt">{{ g.title }}</span><span class="tk-cl-gcnt">{{ g.tasks.length }}</span>
                </template>
                <span v-else class="tk-cl-gplain">{{ $t('app.ungrouped') }}</span>
                <button class="tk-add cl-gadd" type="button" :title="$t('app.addTaskToGroup')" @click="openAdd(g)">
                  <i class="la la-plus-circle"></i>
                </button>
              </div>
              <transition-group class="tk-cl-rows" tag="div" name="tk-clmove">
                <div v-for="t in g.tasks" :key="t.guid" class="tk-cl-row"
                     :class="{ done: t.completed, cancel: t.cancelled }" :style="{ '--cl-depth': t.indent || 0 }" @click="onTaskClick(t, $event)" :title="$t('app.rowJumpTip')"
                     draggable="true" @dragstart="onDragStart($event, t)" @dragend="onDragEnd"
                     @contextmenu.prevent="onContextMenu(t, $event)">
                  <i class="tk-check" :class="[{ done: t.completed }, statusIcon(t)]"
                     @click.stop.prevent="onToggle(t)"></i>
                  <div class="tk-cl-row-main">
                    <div class="tk-cl-sum" v-html="richSummaryNoTags(t)" @click="onRichClick"></div>
                    <div v-if="t.description" class="tk-cl-desc">{{ firstLine(t.description) }}</div>
                  </div>
                  <span v-if="t.dueAt" class="tk-cl-date"><i class="tk-date-ico la la-calendar"></i>{{ dateText(t) }}<template v-if="timeText(t) && !t.dueAllDay"><i class="tk-date-ico tk-date-ico-sep la la-clock"></i>{{ timeText(t) }}</template></span>
                  <span v-if="t.subtaskCount" class="tk-cl-sub"><i class="la la-list-ul"></i>{{ t.subtaskCount }}</span>
                </div>
                <div v-if="!g.tasks.length" key="__empty" class="tk-cl-gempty">{{ $t('app.noTasks') }}</div>
              </transition-group>
            </div>
          </div>

          <!-- 分栏视图：每个分组一栏，固定宽度，多栏时横向滚动 -->
          <div v-else class="tk-cl-cols">
            <!-- 空态两种含义分开：真的没有任务 → 引导落第一个任务；眼睛开着且已无待办 → 说明并给「显示全部」入口 -->
            <div v-if="!visibleGroups.length" class="tk-cl-none tk-cl-none-add">
              <template v-if="activeTotal > 0 && pendingLeft === 0">
                <span>{{ $t('app.clNoPending') }}</span>
                <button class="tk-add cl-eadd" type="button" :title="$t('app.clShowAll')" @click="showAllLists">
                  <i class="la la-eye"></i>
                </button>
              </template>
              <template v-else>
                <span>{{ $t('app.clEmpty') }}</span>
                <button class="tk-add cl-eadd" type="button" :title="$t('app.addTask')" @click="openAdd({ title: '' })">
                  <i class="la la-plus-circle"></i>
                </button>
              </template>
            </div>
            <div v-for="g in visibleGroups" :key="gKey(g)" class="tk-cl-col"
                 :class="{ 'tk-cl-drophover': dragOverTitle === g.title }"
                 @dragover.prevent="onDragOver($event, g.title)" @drop="onDrop($event, g.title)">
            <div class="tk-cl-gtitle" :class="{ 'is-plain': !g.title }">
              <template v-if="g.title">
                <span class="tk-cl-gtxt">{{ g.title }}</span><span class="tk-cl-gcnt">{{ g.tasks.length }}</span>
              </template>
              <span v-else class="tk-cl-gplain">{{ $t('app.ungrouped') }}</span>
              <button class="tk-add cl-gadd" type="button" :title="$t('app.addTaskToGroup')" @click="openAdd(g)">
                <i class="la la-plus-circle"></i>
              </button>
            </div>
            <transition-group class="tk-cl-rows" tag="div" name="tk-clmove">
              <div v-for="t in g.tasks" :key="t.guid" class="tk-cl-row"
                   :class="{ done: t.completed, cancel: t.cancelled }" :style="{ '--cl-depth': t.indent || 0 }" @click="onTaskClick(t, $event)"
                   :title="$t('app.rowJumpTip')"
                   draggable="true" @dragstart="onDragStart($event, t)" @dragend="onDragEnd"
                   @contextmenu.prevent="onContextMenu(t, $event)">
                <i class="tk-check" :class="[{ done: t.completed }, statusIcon(t)]"
                   @click.stop.prevent="onToggle(t)"></i>
                <div class="tk-cl-row-main">
                  <div class="tk-cl-sum" v-html="richSummaryNoTags(t)" @click="onRichClick"></div>
                  <div v-if="t.description" class="tk-cl-desc">{{ firstLine(t.description) }}</div>
                  <span v-if="t.dueAt" class="tk-cl-date tk-cl-date-sub"><i class="tk-date-ico la la-calendar"></i>{{ dateText(t) }}<template v-if="timeText(t) && !t.dueAllDay"><i class="tk-date-ico tk-date-ico-sep la la-clock"></i>{{ timeText(t) }}</template></span>
                </div>
                <span v-if="t.subtaskCount" class="tk-cl-sub"><i class="la la-list-ul"></i>{{ t.subtaskCount }}</span>
              </div>
              <div v-if="!g.tasks.length" key="__empty" class="tk-cl-gempty">{{ $t('app.noTasks') }}</div>
            </transition-group>
            </div>
          </div>
        </template>
      </template>
    </section>

    <!-- 任务行右键菜单（统一单例组件，teleport 到 body；与日/周/月/日程视图共用） -->
    <task-context-menu />
  </div>
</template>

<script>
import { Tasks } from '../../composables/useTasks.js';
import { taskFilePath } from '../../api/tasks.js';
import { statusIcon, dateText, timeText, richSummaryNoTags } from '../../composables/tasks-logic.js';
import { VueModal } from '../../ui/VueModal.js';
import ChecklistEditorModal from '../ChecklistEditorModal.vue';
import TaskEditorModal from '../TaskEditorModal.vue';
import { openTaskInFile } from '../../utils/openTaskInFile.js';
import { openCtxMenu } from '../../composables/useTaskCtxMenu.js';
import TaskContextMenu from './TaskContextMenu.vue';

export default {
  name: 'ChecklistView',
  props: {
    plugin: { type: Object, required: true },
    checklists: { type: Array, default: () => [] },
    // 清单主区视图：列表 / 分栏（由父 TasksApp 提升上来并持久化）
    mainView: { type: String, default: 'cols' },
    // 与日/周/月/日程共享的「仅显示待办」开关（由 TasksApp 的 hideDone 传入）
    hideDone: { type: Boolean, default: false }
  },
  components: { TaskContextMenu },
  // 新建成功后请父级重载清单列表（父级 checklists 属性更新后由 watcher 接手）；
  // show-all：请父级关掉顶栏眼睛（「显示全部」入口，hideDone 由父级持有并持久化）
  emits: ['reload', 'show-all'],
  data() {
    return {
      lists: [],
      activeKey: '',
      activeName: '',
      groups: [],
      activeTotal: 0,
      activeDone: 0,
      loading: false,
      error: '',
      dragGuid: '',        // 正在拖拽的任务 guid
      dragOverTitle: '',   // 当前拖拽悬停的分组标题（用于高亮）
      // 刚新建、尚未被父级清单列表确认的清单：元数据缓存解析 frontmatter 有延迟，
      // 期间靠这两项保住乐观条目与选中态，避免「刚建好就被重置成别的清单」
      pendingKey: '',
      pendingItem: null,
      pendingAt: 0,
    };
  },
  computed: {
    // 左栏可见清单：眼睛开着（「仅显示待办」）时折叠「已无待办」的清单（全部完成 / 全部取消）。
    // 空清单（total = 0）始终保留——新建后立刻从列表消失会让人以为没建成，且它正是落第一个任务的入口。
    // cancelled 由 listChecklists 一并给出：只有 done 的话「1 完成 + 1 取消」这类清单会漏判（同样没有待办）。
    visibleLists() {
      if (!this.hideDone) return this.lists;
      return this.lists.filter((c) => !(c.total > 0 && (c.done || 0) + (c.cancelled || 0) === c.total));
    },
    // 当前被折叠的清单数量（左栏提示行用）
    hiddenCount() { return this.lists.length - this.visibleLists.length; },
    // 当前清单里还剩多少条待办（未完成且未取消）：眼睛过滤后右区为空时，用来区分「空清单」与「已无待办」
    pendingLeft() {
      let n = 0;
      for (const g of this.groups) {
        for (const t of (g.tasks || [])) if (!t.completed && !t.cancelled) n++;
      }
      return n;
    },
    // 隐藏已完成/已取消：仅显示真正的待办（未完成且未取消），并去掉因此变空的组
    visibleGroups() {
      // 稳定排序：未完成在上，已完成/已取消在下方；每组内保持原相对顺序
      const sortTasks = (tasks) => {
        const rank = (t) => (t.completed || t.cancelled) ? 1 : 0;
        return tasks
          .map((t, i) => ({ t, i }))
          .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
          .map((x) => x.t);
      };
      if (!this.hideDone) {
        return this.groups.map((g) => ({ title: g.title, tasks: sortTasks(g.tasks) }));
      }
      return this.groups
        .map((g) => ({ title: g.title, tasks: sortTasks(g.tasks).filter((t) => !(t.completed || t.cancelled)) }))
        .filter((g) => g.tasks.length);
    },
  },
  watch: {
    // 清单列表随父级自动刷新（外部改 tags / 增删清单文件触发重载）后同步本地副本。
    // 之前只 created 时拷贝一次，导致改 tags 后侧栏不刷新，需切视图才更新。
    checklists: {
      immediate: true,
      async handler(cls) {
        const prevKey = this.activeKey;
        this.lists = (cls && cls.length) ? cls.slice() : [];
        // 刚新建的清单可能还没进父级列表（metadataCache 解析新文件 frontmatter 有延迟）：
        // 此时保留乐观条目与当前选中，等下一次重载再对齐——不要回落到 lists[0]，
        // 否则用户刚建好的清单会被瞬间「换成」列表第一项。
        // 退出条件三选一：已进父级列表 / 超过 5s（解析异常时不再无限保护）/ 文件已不在（被删或改名）。
        if (this.pendingKey) {
          const confirmed = this.lists.some((x) => x.key === this.pendingKey);
          const expired = Date.now() - (this.pendingAt || 0) > 5000;
          const path = this.taskFilePath(this.pendingKey);
          const exists = !!(path && this.plugin.app.vault.getAbstractFileByPath(path));
          if (confirmed || expired || !exists) {
            this.pendingKey = '';
            this.pendingItem = null;
          } else {
            if (this.pendingItem && !this.lists.some((x) => x.key === this.pendingItem.key)) {
              this.lists = this.lists.concat([this.pendingItem]).sort((a, b) => this.byName(a, b));
            }
            if (prevKey === this.pendingKey) { await this.loadGroups(prevKey); return; }
            this.pendingKey = '';
          }
        }
        // 选中项的可见性同样按 visibleLists 判断：眼睛开着时被折叠的清单不能再被选中，
        // 否则右区会展示一个左栏里根本不存在的清单。
        if (prevKey && this.visibleLists.some((x) => x.key === prevKey)) {
          // 当前选中项仍在：保留选中、同步名称，并重读当前清单的分组——
          // 右侧 groups / 统计是 loadGroups 读文件得到的本地数据，不随 lists 引用自动更新；
          // 缺这一步会导致手动改笔记后左侧刷新而右侧滞留旧数据
          const c = this.visibleLists.find((x) => x.key === prevKey);
          if (c) this.activeName = c.name;
          await this.loadGroups(prevKey);
        } else if (this.visibleLists.length) {
          await this.selectList(this.visibleLists[0].key);
        } else {
          this.clearSelection();
        }
      }
    },
    // 眼睛切换可能把「当前选中」的清单折叠掉：自动改选第一个可见清单
    hideDone() { this.ensureSelection(); }
  },
  beforeUnmount() {
    // 清掉「新建清单后延后重载」的定时器：视图已关闭时不该再向父级 emit
    for (const t of this._reloadTimers || []) clearTimeout(t);
    this._reloadTimers = [];
  },
  methods: {
    statusIcon, richSummaryNoTags, dateText, timeText, taskFilePath,
    // 「显示全部」：请父级关掉顶栏眼睛（hideDone 由父级持有并持久化到 localStorage）
    showAllLists() { this.$emit('show-all'); },
    // 清空右区选中（没有可见清单时）
    clearSelection() {
      this.activeKey = '';
      this.activeName = '';
      this.groups = [];
      this.activeTotal = 0;
      this.activeDone = 0;
    },
    // 眼睛切换后保证「选中项」仍在可见清单里，否则改选第一个可见清单 / 清空右区
    async ensureSelection() {
      if (this.activeKey && this.visibleLists.some((x) => x.key === this.activeKey)) return;
      if (this.visibleLists.length) { await this.selectList(this.visibleLists[0].key); return; }
      this.clearSelection();
    },
    pct(c) { return c.total ? Math.round((c.done / c.total) * 100) : 0; },
    // 与 loadChecklists() 同一排序（中文按拼音）：新建的清单落位与下次全量刷新后一致
    byName(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'); },
    // 新建清单：弹窗与「新建任务」共用同一套外壳与原语（VueModal + tk-mask/tk-modal/tk-field/btn）
    openNewChecklist() {
      new VueModal(this.plugin.app, ChecklistEditorModal, {
        open: true,
        onSaved: (item) => this.onChecklistCreated(item)
      }).open();
    },
    // 新建清单落地后的视图侧收尾：乐观插入并选中 → 请父级重载列表 → 两次延后对齐元数据缓存
    async onChecklistCreated(item) {
      this.pendingKey = item.key;
      this.pendingItem = item;
      this.pendingAt = Date.now();
      const merged = this.lists.slice();
      if (!merged.some((x) => x.key === item.key)) merged.push(item);
      merged.sort((a, b) => this.byName(a, b));
      this.lists = merged;
      await this.selectList(item.key); // 文件已落盘，读到的是空分组 → 右侧显示「清单为空」
      this.$emit('reload');
      // frontmatter 解析稍晚才进 metadataCache：分两次延后重载（600ms / 1600ms）。
      // 1600ms 那次兜住「首次 changed 事件落在 api 自写静默窗口内被跳过」的情况。
      this._reloadTimers = (this._reloadTimers || []).concat([600, 1600].map((ms) => setTimeout(() => {
        if (this.pendingKey) this.$emit('reload');
      }, ms)));
    },
    gKey(g) { return g.title || '___ungrouped'; },
    firstLine(s) { return String(s || '').split(/\r?\n/)[0]; },
    async selectList(key) {
      this.activeKey = key;
      const c = this.lists.find((x) => x.key === key);
      if (c) this.activeName = c.name;
      await this.loadGroups(key);
    },
    async loadGroups(key) {
      this.loading = true; this.error = '';
      try {
        const r = await Tasks.loadChecklistGroups(key);
        this.groups = r.groups || [];
        this.activeName = r.name || this.activeName;
        this.activeTotal = r.total || 0;
        this.activeDone = r.done || 0;
      } catch (e) { this.error = this.$t('app.loadChecklistFail') + (e && e.message || e); }
      finally { this.loading = false; }
    },
    async onToggle(t) {
      const done = !t.completed;
      try {
        await Tasks.toggleComplete(t.guid, done);
        t.completed = done; t.completedAt = done ? Date.now() : null;
        this.activeDone += done ? 1 : -1;
        const c = this.lists.find((x) => x.key === this.activeKey);
        if (c) c.done += done ? 1 : -1; // lists 与父级 checklists 共享引用，进度同步
      } catch (e) { this.error = this.$t('app.opFail') + (e && e.message || e); }
    },
    // 右键任务行：打开统一右键菜单（写文件 + 就地更新字段由单例处理；重算进度经 onAfterApply 回调）
    onContextMenu(t, e) {
      openCtxMenu(t, e, { onAfterApply: this.recalcProgress, onAfterDelete: () => this.loadGroups(this.activeKey) });
    },
    // 从本地 groups 重新计算当前清单的 total / done，并同步侧栏进度
    recalcProgress() {
      let total = 0, done = 0;
      for (const g of this.groups) for (const t of g.tasks) {
        total += 1;
        if (t.completed && !t.cancelled) done += 1;
      }
      this.activeTotal = total;
      this.activeDone = done;
      const c = this.lists.find((x) => x.key === this.activeKey);
      if (c) { c.total = total; c.done = done; }
    },
    // 任务行点击：Ctrl/⌘ 直接跳转高亮，否则打开编辑器
    onTaskClick(t, e) {
      if (e && (e.metaKey || e.ctrlKey)) this.openTask(t);
      else this.openEditor(t);
    },
    // Ctrl/Cmd + 点击任务项：直接跳转到任务所在笔记并高亮（不打开编辑器）
    async openTask(t) {
      await openTaskInFile(this.plugin, t);
    },
    openEditor(task, defaultDate) {
      new VueModal(this.plugin.app, TaskEditorModal, {
        open: true, task, defaultDate, plugin: this.plugin,
        // 清单列表：编辑器「归属」下拉复用，任务可从这里直接移到别的清单 / 分组
        checklists: this.lists,
        onSaved: () => this.afterMutate(),
        onDeleted: () => this.afterMutate(),
        onMoved: () => this.afterMutate(),
        onSubtasksChanged: () => this.loadGroups(this.activeKey)
      }).open();
    },
    // 任务归属/内容变更后的刷新：任务可能已被移出当前清单，右区要重读，左区计数交父级重载
    afterMutate() {
      this.$emit('reload');
      if (this.activeKey) this.loadGroups(this.activeKey);
    },
    // 分组内新建：弹 TaskEditorModal（create 模式），保存时追加到该分组最后一行
    openAdd(g) {
      new VueModal(this.plugin.app, TaskEditorModal, {
        open: true, task: null, defaultDate: '', plugin: this.plugin,
        createIn: { list: this.activeKey, group: g.title || '' },
        checklists: this.lists,
        onMoved: () => this.afterMutate(),
        onSaved: () => this.loadGroups(this.activeKey),
        onDeleted: () => this.loadGroups(this.activeKey),
        onSubtasksChanged: () => this.loadGroups(this.activeKey)
      }).open();
    },
    openFile(key) {
      const path = taskFilePath(key);
      if (!path) return;
      this.plugin.app.workspace.openLinkText(path, '', false);
    },
    // v-html 内的链接点击：阻止冒泡，避免同时触发所在行的「打开编辑器」
    onRichClick(e) {
      if (e.target && e.target.tagName === 'A') e.stopPropagation();
    },
    // 拖拽：将任务项拖到其他分组
    onDragStart(e, t) {
      this.dragGuid = t.guid;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', t.guid);
      }
    },
    onDragEnd() { this.dragGuid = ''; this.dragOverTitle = ''; },
    onDragOver(e, title) { this.dragOverTitle = title; },
    onDrop(e, title) {
      const guid = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || this.dragGuid;
      this.dragOverTitle = ''; this.dragGuid = '';
      if (!guid) return;
      this.moveTask(guid, title);
    },
    async moveTask(guid, title) {
      try {
        await Tasks.moveChecklistTask(this.activeKey, guid, title);
        await this.loadGroups(this.activeKey); // 重新加载以反映新分组
      } catch (e) { this.error = this.$t('app.moveFail') + (e && e.message || e); }
    }
  }
};
</script>

<style scoped>
.tk-clview { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; }

/* ===== 左侧清单列表（随面板按比例收窄，不再固定 260px） ===== */
.tk-cl-side {
  /* 与右侧按 2:5 占比共享空间，面板变窄时本列按比例收窄；
     container-type 让内部按钮随「本列宽度」响应，而非主窗口 */
  flex: 2 1 0; max-width: 260px; min-width: 120px; min-height: 0;
  container-type: inline-size;
  display: flex; flex-direction: column;
  border-right: 1px solid var(--line);
  background: var(--panel);
}
.tk-cl-side-h {
  flex: none; display: flex; align-items: center; gap: 8px; min-width: 0;
  padding: 14px 16px; font-size: 14px; font-weight: 700; color: var(--ink);
  border-bottom: 1px solid var(--line);
}
/* 窄面板 / 英文界面下标题可省略，保证右侧「新建清单」按钮不被挤出可见区 */
.tk-cl-side-h > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tk-cl-side-h i { color: var(--gold); font-size: 16px; }
.tk-cl-side-empty {
  padding: 28px 18px; color: var(--ink-soft); font-size: 12.5px; line-height: 1.7; text-align: center;
}
.tk-cl-list { flex: 1; overflow: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
/* ===== 被折叠的已完成清单：留一行可点提示，避免用户以为清单被删 ===== */
.tk-cl-hidden {
  flex: none; display: flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap;
  padding: 10px 12px; border-top: 1px solid var(--line);
  color: var(--ink-soft); font-size: 11.5px; line-height: 1.5; text-align: center;
}
/* 所有清单都被折叠：提示块占满剩余高度、靠上对齐（替代「还没有清单」的空态） */
.tk-cl-hidden-all { flex: 1; align-items: flex-start; padding-top: 28px; border-top: none; }
.tk-cl-hidden-btn {
  flex: none; border: none; background: transparent; padding: 0 2px; margin: 0;
  color: var(--gold); font-family: inherit; font-size: 11.5px; line-height: 1.5; cursor: pointer;
}
.tk-cl-hidden-btn:hover { text-decoration: underline; }
.tk-cl-item { display: flex; align-items: center; gap: 8px; }
.tk-cl-item-main {
  flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 7px;
  padding: 11px 12px; border-radius: 10px; cursor: pointer;
  border: 1px solid transparent; text-align: left;
  background: transparent; color: var(--ink);
  transition: background .15s ease, transform .12s ease;
}
/* 清单项右侧：打开对应 vault 文件（独立于选中态，与列表视图一致） */
.tk-cl-open {
  flex: none; width: 28px; height: 28px; padding: 0; border: none; border-radius: 8px;
  background: transparent; color: var(--ink-soft); cursor: pointer; font-size: 14px;
  display: inline-flex; align-items: center; justify-content: center; box-shadow: none;
  transition: background .15s ease, color .15s ease;
}
.tk-cl-open:hover { background: var(--gold-bg); color: var(--gold); }
.tk-cl-item-main:hover { background: var(--gold-bg); }
.tk-cl-item-main:active { transform: scale(.99); }
.tk-cl-item-main.on { background: var(--gold); border-color: transparent; box-shadow: var(--shadow-s); }
.tk-cl-item-main.on .tk-cl-name,
.tk-cl-item-main.on .tk-cl-meta { color: var(--text-on-accent); }
.tk-cl-item-main.on .tk-cl-bar { background: rgba(255, 255, 255, .28); }
.tk-cl-name { font-size: 14px; font-weight: 600; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tk-cl-bar { height: 6px; border-radius: 999px; background: rgba(127, 127, 127, .18); overflow: hidden; }
.tk-cl-bar > i { display: block; height: 100%; border-radius: 999px; background: var(--c-done); transition: width .3s ease; }
.tk-cl-meta { font-size: 11px; color: var(--ink-soft); font-variant-numeric: tabular-nums; }

/* ===== 右侧主区（随面板弹性收窄；container-type 让任务日期随「本区宽度」响应） ===== */
.tk-cl-main { flex: 5 1 0; min-width: 0; min-height: 0; display: flex; flex-direction: column; container-type: inline-size; }
.tk-cl-empty-main { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--ink-soft); }
.tk-cl-main-h {
  flex: none; display: flex; align-items: center; gap: 12px;
  padding: 14px 0 14px 20px; border-bottom: 1px solid var(--line);
}
.tk-cl-head-l { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tk-cl-title { font-size: 18px; font-weight: 700; color: var(--ink); line-height: 1.25; word-break: break-all; }
.tk-cl-prog { font-size: 12px; color: var(--ink-soft); font-variant-numeric: tabular-nums; }

.tk-cl-loading, .tk-cl-none { padding: 40px; text-align: center; color: var(--ink-soft); }
/* 空清单：文案 + 「加任务」按钮同一行居中（新建的清单默认没有任何分组，这是落第一个任务的入口） */
.tk-cl-none-add { display: flex; align-items: center; justify-content: center; gap: 2px; }
.tk-cl-body { flex: 1; overflow: auto; padding: 4px 20px 28px; }

.tk-cl-group { margin-top: 18px; }
/* 拖拽放置目标高亮（列表 / 分栏两种容器通用） */
.tk-cl-group.tk-cl-drophover,
.tk-cl-col.tk-cl-drophover { background: var(--gold-bg); }
.tk-cl-gtitle {
  display: flex; align-items: center; gap: 10px;
  font-size: 15px; font-weight: 700; color: var(--ink);
  padding: 8px 0 9px; margin-bottom: 4px;
  border-bottom: 1px solid var(--line);
}
.tk-cl-gtitle::before { content: ''; width: 4px; height: 16px; border-radius: 3px; background: var(--gold); flex: none; }
.tk-cl-gtitle.is-plain { border-bottom: none; padding-top: 0; }
.tk-cl-gtitle.is-plain::before { background: transparent; width: 0; }
.tk-cl-gtxt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tk-cl-gplain { font-size: 12px; font-weight: 600; color: var(--ink-soft); }
.tk-cl-gcnt { font-size: 11px; font-weight: 600; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.tk-cl-rows { display: flex; flex-direction: column; }
/* 清单任务排序动画：勾选完成/取消后平滑沉到组底（FLIP 位移），并给增删一个轻微淡入淡出 */
/* 用 .tk-cl-rows 后代选择器提高特异性，压过 .tk-cl-row 自带的 transition（否则 transform 不被过渡，位移动画失效） */
.tk-cl-rows .tk-clmove-move { transition: transform .3s cubic-bezier(.4, 0, .2, 1); }
.tk-cl-rows .tk-clmove-enter-active,
.tk-cl-rows .tk-clmove-leave-active { transition: opacity .2s ease; }
.tk-cl-rows .tk-clmove-enter-from,
.tk-cl-rows .tk-clmove-enter { opacity: 0; }
.tk-cl-rows .tk-clmove-leave-to,
.tk-cl-rows .tk-clmove-leave { opacity: 0; }

.tk-cl-row {
  display: flex; align-items: flex-start; gap: 11px;
  padding: 9px 10px; border-radius: 9px; cursor: grab;
  /* 按层级深度缩进，体现主任务 / 子任务隶属关系（深度来自 toRecord 的 indent） */
  padding-left: calc(10px + (var(--cl-depth, 0) * 24px));
  transition: background .15s ease;
}
.tk-cl-row:active { cursor: grabbing; }
.tk-cl-row:hover { background: var(--gold-bg); }
.tk-cl-row .tk-check { flex: none; margin-top: 1px; }
.tk-cl-row-main { flex: 1 1 auto; min-width: 0; }
.tk-cl-sum { font-size: 14px; color: var(--ink); line-height: 1.5; word-break: break-word; }
.tk-cl-sum :deep(a) { color: var(--accent, var(--gold)); }
.tk-cl-desc { font-size: 12px; color: var(--ink-soft); line-height: 1.5; margin-top: 2px; word-break: break-word; }
.tk-cl-row.done .tk-cl-sum { color: var(--ink-soft); opacity: .75; }
.tk-cl-row.cancel .tk-cl-sum { color: var(--ink-soft); text-decoration: line-through; opacity: .75; }
.tk-cl-row.done .tk-cl-desc,
.tk-cl-row.cancel .tk-cl-desc { opacity: .5; }
.tk-cl-date { flex: none; font-size: 12px; color: var(--text-faint); font-variant-numeric: tabular-nums; padding-top: 3px; }
/* 分栏视图下：日期时间作为任务文字下方的副行（块级、与正文留间距） */
.tk-cl-date-sub { display: block; margin-top: 3px; }
.tk-cl-sub { flex: none; display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--ink-soft); padding-top: 2px; }
.tk-cl-gempty { padding: 6px 10px 10px; color: var(--ink-soft); font-size: 12px; opacity: .7; }

/* 分栏视图：每个分组一栏，固定宽度，横向滚动；每栏内部独立纵向滚动 */
.tk-cl-cols {
  flex: 1; min-height: 0; display: flex; gap: 14px; align-items: stretch;
  overflow-x: auto; overflow-y: hidden; padding: 12px 20px 20px;
  /* 横向滚动条常驻可见（macOS 默认会隐藏，仅滚动时闪现） */
  scrollbar-width: thin;
  scrollbar-color: var(--ink-soft) transparent;
}
.tk-cl-cols::-webkit-scrollbar { height: 10px; }
.tk-cl-cols::-webkit-scrollbar-track { background: transparent; }
.tk-cl-cols::-webkit-scrollbar-thumb {
  background: var(--ink-soft); border-radius: 999px;
  border: 3px solid transparent; background-clip: padding-box;
}
.tk-cl-cols::-webkit-scrollbar-thumb:hover { background: var(--gold); }
.tk-cl-cols > .tk-cl-none { flex: 1; }
.tk-cl-col {
  flex: none; width: 280px; min-height: 0;
  display: flex; flex-direction: column;
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
}
.tk-cl-col .tk-cl-gtitle {
  flex: none; margin: 0; padding: 12px 14px 10px; border-bottom: 1px solid var(--line);
}
.tk-cl-col .tk-cl-gtitle.is-plain { border-bottom: 1px solid var(--line); padding-top: 12px; }
.tk-cl-col .tk-cl-rows {
  flex: 1; overflow-y: auto; padding: 6px 8px 12px; gap: 2px;
  /* 分栏内纵向滚动条同样常驻可见 */
  scrollbar-width: thin; scrollbar-color: var(--ink-soft) transparent;
}
.tk-cl-col .tk-cl-rows::-webkit-scrollbar { width: 8px; }
.tk-cl-col .tk-cl-rows::-webkit-scrollbar-track { background: transparent; }
.tk-cl-col .tk-cl-rows::-webkit-scrollbar-thumb {
  background: var(--ink-soft); border-radius: 999px;
  border: 2px solid transparent; background-clip: padding-box;
}
.tk-cl-col .tk-cl-rows::-webkit-scrollbar-thumb:hover { background: var(--gold); }
/* 窄页面分栏模式：每栏收窄、栏间距收紧，避免横向空间浪费（随面板宽度而非主窗口） */
@container (max-width: 720px) {
  .tk-cl-cols { gap: 10px; padding: 10px 14px 16px; }
  .tk-cl-col { width: 240px; }
}
@container (max-width: 480px) {
  .tk-cl-cols { gap: 6px; padding: 8px 10px 12px; }
  .tk-cl-col { width: 196px; }
}
/* 窄页面列表视图（分组竖向堆叠）：收紧左右内边距、分组间距与行内 gap，避免窄屏留白过多（随面板宽度） */
@container (max-width: 720px) {
  .tk-cl-body { padding: 4px 14px 24px; }
  .tk-cl-main-h { padding: 12px 0 12px 14px; }
  .tk-cl-group { margin-top: 14px; }
  .tk-cl-gtitle { gap: 8px; padding: 7px 0 8px; }
  .tk-cl-row { gap: 9px; padding-right: 8px; }
}
@container (max-width: 480px) {
  .tk-cl-body { padding: 4px 10px 20px; }
  .tk-cl-main-h { padding: 10px 0 10px 10px; }
  .tk-cl-group { margin-top: 10px; }
  .tk-cl-gtitle { gap: 6px; padding: 6px 0 7px; }
  .tk-cl-row { gap: 7px; padding-right: 6px; }
}

/* ===== 随「各自容器宽度」收起次要信息（与日程视图一致，均看本列/本区宽度而非主窗口） ===== */
/* 左侧清单列变窄（≤200px）：隐藏「打开文件」按钮、已完成计数与百分比进度条，仅留清单名称 */
@container (max-width: 200px) {
  .tk-cl-open, .tk-cl-meta, .tk-cl-bar { display: none; }
}
/* 右侧主区变窄（≤420px）：隐藏任务行的日期与时间，仅留正文 */
@container (max-width: 420px) {
  .tk-cl-date { display: none; }
}
</style>

<!-- 右键菜单 teleport 到 body，scoped 样式无法命中，这里用全局（非 scoped）样式确保生效 -->

