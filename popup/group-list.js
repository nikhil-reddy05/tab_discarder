(function registerGroupListRenderer(globalScope) {
  const UNGROUPED_TAB_ID = -1;
  const GROUP_COLORS = Object.freeze({
    grey: "#5f6368",
    blue: "#1a73e8",
    red: "#d93025",
    yellow: "#f9ab00",
    green: "#188038",
    pink: "#d01884",
    purple: "#a142f4",
    cyan: "#007b83",
    orange: "#e8710a",
  });

  function isGroupedTab(tab) {
    return Number.isInteger(tab?.groupId) && tab.groupId !== UNGROUPED_TAB_ID;
  }

  function getUngroupedTabs(tabs) {
    return tabs.filter((tab) => !isGroupedTab(tab));
  }

  function getGroupTitle(group) {
    return typeof group?.title === "string" && group.title.trim()
      ? group.title.trim()
      : "Untitled group";
  }

  function getGroupColor(group) {
    return GROUP_COLORS[group?.color] || GROUP_COLORS.grey;
  }

  function buildGroupSummaries(groups, tabs, tabStateModel) {
    return groups.map((group) => {
      const memberTabs = tabs.filter((tab) => tab.groupId === group.id);
      const sleepingCount = memberTabs.filter(
        (tab) => tabStateModel.deriveTabState(tab) === tabStateModel.states.SLEEPING,
      ).length;

      return {
        groupId: group.id,
        title: getGroupTitle(group),
        color: getGroupColor(group),
        memberTabs,
        totalCount: memberTabs.length,
        awakeCount: memberTabs.length - sleepingCount,
        sleepingCount,
      };
    });
  }

  function createGroupMemberList(document, groupSummary, renderOptions) {
    const memberList = document.createElement("ul");
    memberList.className = "group-member-list tab-list";
    memberList.id = `group-members-${groupSummary.groupId}`;
    memberList.hidden = true;
    memberList.setAttribute("aria-label", `Tabs in ${groupSummary.title}`);

    if (
      renderOptions.tabListRenderer &&
      renderOptions.tabStateModel &&
      renderOptions.onSleepTab
    ) {
      renderOptions.tabListRenderer.renderTabList(
        memberList,
        groupSummary.memberTabs,
        renderOptions.tabStateModel,
        renderOptions.onSleepTab,
      );
    }

    return memberList;
  }

  function createGroupRow(document, groupSummary, onSleepGroup, renderOptions) {
    const row = document.createElement("li");
    row.className = "group-row";

    const header = document.createElement("div");
    header.className = "group-row-header";

    const color = document.createElement("span");
    color.className = "group-color";
    color.style.backgroundColor = groupSummary.color;
    color.setAttribute("aria-hidden", "true");
    header.append(color);

    const details = document.createElement("div");
    details.className = "group-details";

    const title = document.createElement("span");
    title.className = "group-title";
    title.textContent = groupSummary.title;
    details.append(title);

    const summary = document.createElement("span");
    summary.className = "group-summary";
    summary.textContent = `${groupSummary.totalCount} tabs · ${groupSummary.awakeCount} awake · ${groupSummary.sleepingCount} sleeping`;
    details.append(summary);

    header.append(details);

    const memberList = createGroupMemberList(
      document,
      groupSummary,
      renderOptions,
    );

    const expandAction = document.createElement("button");
    expandAction.className = "group-expand-action";
    expandAction.type = "button";
    expandAction.setAttribute("aria-controls", memberList.id);

    function setExpanded(expanded) {
      memberList.hidden = !expanded;
      expandAction.setAttribute("aria-expanded", String(expanded));
      expandAction.setAttribute(
        "aria-label",
        `${expanded ? "Hide" : "Show"} tabs in ${groupSummary.title}`,
      );
      expandAction.title = expanded ? "Hide group tabs" : "Show group tabs";
      expandAction.textContent = expanded ? "⌃" : "⌄";
    }

    setExpanded(false);
    expandAction.addEventListener("click", () => {
      setExpanded(memberList.hidden);
    });
    header.append(expandAction);

    const action = document.createElement("button");
    action.className = "group-sleep-action";
    action.type = "button";
    action.textContent = "Sleep group";
    action.addEventListener("click", async () => {
      action.disabled = true;
      action.textContent = "Sleeping…";

      try {
        await onSleepGroup(groupSummary.groupId);
      } finally {
        action.disabled = false;
        action.textContent = "Sleep group";
      }
    });
    header.append(action);

    row.append(header, memberList);

    return row;
  }

  function renderGroupList(
    container,
    groupSummaries,
    onSleepGroup,
    renderOptions = {},
  ) {
    container.replaceChildren();

    for (const groupSummary of groupSummaries) {
      container.append(
        createGroupRow(
          container.ownerDocument,
          groupSummary,
          onSleepGroup,
          renderOptions,
        ),
      );
    }
  }

  const groupListRenderer = Object.freeze({
    isGroupedTab,
    getUngroupedTabs,
    getGroupTitle,
    getGroupColor,
    buildGroupSummaries,
    renderGroupList,
  });

  globalScope.tabDiscarderGroupList = groupListRenderer;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = groupListRenderer;
  }
})(globalThis);
