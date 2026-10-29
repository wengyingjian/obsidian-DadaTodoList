<template>
  <transition name="tk-side">
    <aside v-if="open" class="tk-side" :class="{ 'side-anim': animating, 'drop-active': dropActive }"
           @dragenter.prevent @dragover.prevent="onPanelDragOver" @dragleave="onPanelDragLeave" @drop.prevent="onDropToPool">
      <div class="tk-side-h">
        <i class="la la-inbox tk-pool-ic"></i>
        <span>{{ $t('app.todoPool') }}</span>
        <span class="cnt">{{ totalCount }}</span>
        <button class="tk-side-close" type="button" :title="$t('app.collapseTodo')" @click="$emit('toggle-panel')"><i class="la la-times"></i></button>
      </div>
      <div class="tk-side-sub">{{ $t('app.todoPoolSource') }}</div>

      <div class="tk-side-body">
        <div v-if="!hasAny && !isDragging" class="tk-side-empty">{{ $t('app.noTodos') }}</div>

        <!-- 独立事项：收件箱文件里的无日期待办，按 ### 标题分组（与清单文件同一套分组规则）。
             分组头即拖拽落点：把任务拖到某个分组 = 移动到该分组（同文件只换分组、跨文件顺带清日期）；标题可折叠 -->
        <section v-if="standaloneCount || (isDragging && standaloneGroups.length)" class="tk-side-sec">
          <div class="tk-side-sec-h" @click="toggleCollapse('__standalone')">
            <i class="la la-chevron-right tk-sec-caret" :class="{ open: !isCollapsed('__standalone') }"></i>
            <i class="la la-sticky-note tk-sec-ic"></i>
            <span class="tk-side-sec-title">{{ $t('app.standalone') }}</span>
            <span class="cnt">{{ standaloneCount }}</span>
          </div>
          <div v-show="!isCollapsed('__standalone')">
            <div v-for="g in standaloneGroups" :key="g.id" class="tk-side-group"
                 v-show="g.tasks.length || isDragging"
                 :class="{ 'is-drop-over': dragOverGroup === g.id }"
                 @dragover.prevent.stop="onGroupDragOver(g, $event)"
                 @dragleave="onGroupDragLeave(g, $event)"
                 @drop.prevent.stop="onDropToGroup(g, $event)">
              <div class="tk-side-g-h" @click="toggleCollapse(g.id)">
                <i class="la la-chevron-right tk-sec-caret" :class="{ open: !isCollapsed(g.id) }"></i>
                <span>{{ g.title || $t('app.ungrouped') }}</span>
                <span class="cnt">{{ g.tasks.length }}</span>
              </div>
              <div v-show="isDragging || !isCollapsed(g.id)" class="tk-side-list">
                <div v-for="t in g.tasks" :key="t.guid" class="tk-side-item"
                     :class="{ dragging: dragGuid === t.guid }"
                     :title="dragHint(t)" draggable="true"
                     @dragstart="$emit('drag-start', t, $event)"
                     @dragend="onDragEnd"
                     @click="$emit('open-task', t, $event)">
                  <i class="tk-check" :class="[{ done: t.completed }, statusIcon(t)]" ></i>
                  <span class="tk-side-sum" v-html="richSummary(t)" @click="$emit('rich-click', $event)"></span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 清单文件：按文件名成块（含待办数量，可折叠），文件内再按 ### 标题分组（含每组数量，可折叠） -->
        <section v-for="f in clFiles" :key="f.key" class="tk-side-sec">
          <div class="tk-side-sec-h" @click="toggleCollapse(f.key)">
            <i class="la la-chevron-right tk-sec-caret" :class="{ open: !isCollapsed(f.key) }"></i>
            <i class="la la-file-text-o tk-file-ic"></i>
            <span class="tk-side-sec-title">{{ f.name }}</span>
            <span class="cnt">{{ f.total }}</span>
          </div>
          <div v-show="!isCollapsed(f.key)">
            <div v-for="g in f.allGroups" :key="g.id" class="tk-side-group"
                 v-show="g.tasks.length || isDragging"
                 :class="{ 'is-drop-over': dragOverGroup === gk(f, g) }"
                 @dragover.prevent.stop="onGroupDragOver(listTarget(f, g), $event)"
                 @dragleave="onGroupDragLeave(listTarget(f, g), $event)"
                 @drop.prevent.stop="onDropToGroup(listTarget(f, g), $event)">
              <div class="tk-side-g-h" @click="toggleCollapse(gk(f, g))">
                <i class="la la-chevron-right tk-sec-caret" :class="{ open: !isCollapsed(gk(f, g)) }"></i>
                <span>{{ g.title || $t('app.ungrouped') }}</span>
                <span class="cnt">{{ g.tasks.length }}</span>
              </div>
              <div v-show="isDragging || !isCollapsed(gk(f, g))" class="tk-side-list">
                <div v-for="t in g.tasks" :key="t.guid" class="tk-side-item"
                     :class="{ dragging: dragGuid === t.guid }"
                     :title="dragHint(t)" draggable="true"
                     @dragstart="$emit('drag-start', t, $event)"
                     @dragend="onDragEnd"
                     @click="$emit('open-task', t, $event)">
                  <i class="tk-check" :class="[{ done: t.completed }, statusIcon(t)]" ></i>
                  <span class="tk-side-sum" v-html="richSummary(t)" @click="$emit('rich-click', $event)"></span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </aside>
  </transition>
</template>

<script>
// 待办侧栏（周/日视图与月视图共用）：待办池。
// 仅展示【无日期】待办（含清单），去掉了原来的「所有待办（含日期）」分页：
//   - 「独立事项」：来自收件箱文件、未归入任何清单的无日期待办；标题右侧「?」悬停显示来源说明；
//   - 清单文件：每个清单按文件名成块（含待办数量），文件内再按 ### 标题分组（含每组数量）。
// 每一类（独立事项 / 清单文件 / 分组）标题可点击折叠；折叠状态仅本次视图存活（切换视图会重置）。
// 任务池与清单列表由父级经 props 下发；勾选 / 打开 / 拖拽等交互经事件交还父级。
import { statusIcon, renderInlineHtml, plainInline, INBOX_KEY } from '../composables/tasks-logic.js';
import { Tasks } from '../composables/useTasks.js';

// 待办池展示条件：无日期、未完成、未取消，且不是子任务（子任务随父任务一起管理）
const isPoolItem = (t) => !t.dueAt && !t.completed && !t.cancelled && !(t.indent > 0);

export default {
  name: 'TodoSidePanel',
  props: {
    // 是否展开（父级 todoPanelOpen 控制整块面板的开合）
    open: { type: Boolean, default: false },
    // 清单列表（用于读取各清单内的无日期任务）
    checklists: { type: Array, default: () => [] },
    // 正在拖拽的任务 guid（高亮用）
    dragGuid: { type: String, default: '' },
    // 正在拖拽的任务对象（落点清日期用）
    dragTask: { type: Object, default: null }
  },
  emits: ['toggle-panel', 'open-task', 'drag-start', 'drag-end', 'rich-click', 'saved', 'error'],
  // 注册进宿主的侧栏注册表：任务落盘后宿主经 refreshIfVisible 广播刷新缓存。
  // 本组件实例分布在 WeekDayView / TaskMonthView 内，父级 $refs 直达不可靠，故走 provide/inject。
  // plugin 由根 vueApp provide，用于读取收件箱文件路径（独立事项来源说明）。
  inject: ['registerTodoPanel', 'unregisterTodoPanel', 'plugin'],
  data() {
    return {
      // 各清单文件：{ key, name, total, groups（有待办）, allGroups（含空分组，拖拽落点用） }
      clFiles: [],
      clLoaded: false,            // 清单无日期任务是否已加载（仅首次懒加载）
      // 收件箱文件的无日期待办，按 ### 标题分组：{ title, tasks }[]
      inboxGroups: [],
      // 入场动画标记（一次性，700ms 后摘掉）
      animating: false,
      // 折叠的类别 key 列表（独立事项 '__standalone'、分组 '__inbox::标题' / 'gk(f,g)'、清单文件 f.key）
      collapsedKeys: [],
      // 拖拽悬停于待办池（放置即清除日期）时的高亮标记
      dropActive: false,
      // 拖拽悬停于某个分组（放置即移动到该分组）时的分组 key
      dragOverGroup: ''
    };
  },
  computed: {
    // 拖拽进行中（父级在 dragstart 时设置 dragTask）：期间展开折叠的分组，保证锚点都能接住
    isDragging() {
      return !!this.dragTask;
    },
    // 独立事项：收件箱全部分组（空分组也留在数组里，显隐交给 v-show）。
    // 关键：数组长度在拖拽前后必须一致 —— 拖拽中改变 v-for 列表会让 Vue 插入/移动节点，
    // 浏览器会因此中断正在进行的 drag（表现为「松手没反应、任务还在原地」）。
    standaloneGroups() {
      return this.inboxGroups.map((g) => ({
        id: '__inbox::' + (g.title || '__ungrouped'),
        listKey: INBOX_KEY,
        title: g.title,
        tasks: g.tasks.filter(isPoolItem)
      }));
    },
    standaloneCount() {
      return this.standaloneGroups.reduce((s, g) => s + g.tasks.length, 0);
    },
    // 是否还有任何待办（控制空态显隐）
    hasAny() {
      return this.standaloneCount > 0 || this.clFiles.length > 0;
    },
    // 待办池总计数（独立事项 + 各清单文件之和）
    totalCount() {
      const cl = this.clFiles.reduce((s, f) => s + f.total, 0);
      return this.standaloneCount + cl;
    },
    // 收件箱文件路径（用于「独立事项」来源说明）
    inboxPath() {
      const p = this.plugin && this.plugin.settings && this.plugin.settings.inboxFile;
      return p || 'DadaTodoList.md';
    }
  },
  mounted() {
    if (this.registerTodoPanel) this.registerTodoPanel(this);
  },
  watch: {
    // 面板展开时播放入场动画，并懒加载清单无日期任务。
    // immediate：视图切换（周↔日经 :key 重建、月视图换容器）会重挂载本组件，
    // 若挂载时面板已处于展开状态，open 不会发生变化，必须在初始时也触发一次加载，
    // 否则重挂载后无日期列表为空
    open: {
      immediate: true,
      handler(open) {
        clearTimeout(this._animTimer);
        if (!open) { this.animating = false; return; }
        this.animating = true;
        this._animTimer = setTimeout(() => { this.animating = false; }, 700);
        this.loadClNoDate();
      }
    }
  },
  beforeUnmount() {
    clearTimeout(this._animTimer);
    if (this.unregisterTodoPanel) this.unregisterTodoPanel(this);
  },
  methods: {
    // 某类别是否折叠
    isCollapsed(key) { return this.collapsedKeys.indexOf(key) !== -1; },
    // 切换某类别折叠状态
    toggleCollapse(key) {
      const i = this.collapsedKeys.indexOf(key);
      if (i === -1) this.collapsedKeys.push(key);
      else this.collapsedKeys.splice(i, 1);
    },
    // 分组稳定 key（文件 key + 分组 id）
    gk(f, g) { return f.key + '::' + g.id; },
    byDue(a, b) { return (a.dueAt || Infinity) - (b.dueAt || Infinity); },
    // 首次懒加载清单无日期任务（按清单文件 → ### 标题 分组，仅保留无日期待办）
    loadClNoDate() {
      if (this.clLoaded) return;
      this.clLoaded = true;
      this.readClNoDate();
    },
    // 重新读取清单无日期任务（任务改期 / 完成后调用，刷新缓存避免滞留）
    async refreshClNoDate() { await this.readClNoDate(); },
    // 面板可见或已加载过缓存时刷新（供宿主在任务落盘后广播调用）
    refreshIfVisible() {
      if (this.open) this.refreshClNoDate();
      else if (this.clLoaded) this.refreshClNoDate();
    },
    async readClNoDate() {
      // 收件箱（独立事项）：与清单文件同一套 ### 分组规则，单独读取以便分组展示与拖拽归组
      try {
        const inbox = await Tasks.loadInboxGroups();
        this.inboxGroups = inbox.groups || [];
      } catch (e) { /* 收件箱读取失败不影响清单块 */ }
      try {
        const lists = this.checklists.length ? this.checklists : await Tasks.loadChecklists();
        const files = [];
        for (const c of lists) {
          const r = await Tasks.loadChecklistGroups(c.key);
          // allGroups：含当前没有待办的分组（拖拽时的落点）；groups：平时只显示有待办的
          const allGroups = (r.groups || []).map((g) => ({
            id: g.title || '__ungrouped',
            title: g.title,
            tasks: g.tasks.filter(isPoolItem)
          }));
          const groups = allGroups.filter((g) => g.tasks.length);
          const total = groups.reduce((s, g) => s + g.tasks.length, 0);
          if (total) files.push({ key: c.key, name: r.name || c.name, total, groups, allGroups });
        }
        this.clFiles = files;
      } catch (e) { /* 加载失败不影响其余功能 */ }
    },
    // 拖拽提示：纯标题 +「可拖动改期」说明
    dragHint(t) {
      return this.$t('app.dragHintFull', { title: plainInline(t.summary) });
    },
    // 标题渲染：把 [文本](链接) 与 #标签 解析为可点击链接 / 样式化标签
    richSummary(t) {
      return renderInlineHtml(t && t.summary);
    },
    statusIcon(t) { return statusIcon(t); },
    // 拖拽悬停待办池：标记高亮并允许放置
    onPanelDragOver(e) {
      this.dropActive = true;
      if (e && e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    },
    // 离开待办池（且不是进入其子元素）时取消高亮
    onPanelDragLeave(e) {
      if (!e || !e.currentTarget || !e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
        this.dropActive = false;
        this.dragOverGroup = '';
      }
    },
    // 把任务拖回待办池空白处：清除其日期（含跨日起始锚点 startAt），使其回到无日期池。
    // 注意：这是改动前就有的行为，面板层不参与分组判定 —— 分组拖拽由 .tk-side-group 上的
    // drop 单独处理，命中分组就不会走到这里（那边有 .stop）。保持原样以免影响基本功能。
    async onDropToPool(e) {
      let t = this.dragTask;
      if ((!t || !t.guid) && e && e.dataTransfer) {
        const guid = e.dataTransfer.getData('text/plain');
        if (guid) t = { guid };
      }
      this.dropActive = false;
      this.$emit('drag-end');
      if (!t || !t.guid) return;
      // 两步走，保证「拖到外层」永远至少完成原有行为：
      //   1) updateTask 清日期 —— 你此前确认可用的逻辑
      //   2) 再尝试搬到第一个 ### 之前（未分组）；这一步失败也不回滚第 1 步
      // 清单文件内的任务只做第 1 步（留在原清单，分组由该文件自己维护）。
      const inList = String(t.guid).split('#')[0].indexOf('cl:') === 0;
      try {
        const saved = await Tasks.updateTask(t.guid, {
          dueAt: null, dueAllDay: false, dueEndAt: null, startAt: null
        });
        if (!inList) {
          try {
            await Tasks.moveTaskToGroup((saved && saved.guid) || t.guid, INBOX_KEY, '');
          } catch (e) {
            console.warn('[DadaTodo] 移到「未分组」失败（日期已清除）：', e && e.message, e && e.reason);
          }
        }
        await this.readClNoDate();
        this.$emit('saved');
      } catch (err) {
        this.$emit('error', this.$t('app.clearDateFail') + (err && err.message || err));
      }
    },
    /* ---------- 拖到某个分组：移动到该分组（收件箱内部重组 / 从日历或其它清单搬入） ---------- */
    // 清单块分组的落点描述（模板内拼装用）
    listTarget(f, g) {
      return { id: this.gk(f, g), listKey: f.key, title: g.title };
    },
    // 拖拽结束：清掉分组高亮并交还父级清空 dragTask
    onDragEnd() {
      this.dragOverGroup = '';
      this.$emit('drag-end');
    },
    // 有拖拽源时才把分组标成落点，避免外部拖入文件时误高亮
    onGroupDragOver(g, e) {
      if (!this.dragTask) return;
      this.dragOverGroup = g.id;
      if (e && e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    },
    onGroupDragLeave(g, e) {
      if (!e || !e.currentTarget || !e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
        if (this.dragOverGroup === g.id) this.dragOverGroup = '';
      }
    },
    // 落盘：同文件只换分组；跨文件（日历 / 其它清单）搬入该分组并清掉日期，回到无日期待办。
    // 必须在 drop 上 .stop，否则冒泡到面板层会把日期清掉却留在原分组。
    async onDropToGroup(g, e) {
      let t = this.dragTask;
      if ((!t || !t.guid) && e && e.dataTransfer) {
        const guid = e.dataTransfer.getData('text/plain');
        if (guid) t = { guid };
      }
      this.dragOverGroup = '';
      this.$emit('drag-end');
      if (!t || !t.guid) return;
      try {
        await Tasks.moveTaskToGroup(t.guid, g.listKey, g.title || '');
        // 本地立即重读：同文件内换分组不会触发宿主的外部变更检测
        await this.readClNoDate();
        this.$emit('saved');
      } catch (err) {
        this.$emit('error', this.$t('app.moveFail') + (err && err.message || err));
      }
    }
  }
};
</script>
