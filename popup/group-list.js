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
  const GROUP_COLOR_CLASSES = Object.freeze({
    grey: "group-color--grey",
    blue: "group-color--blue",
    red: "group-color--red",
    yellow: "group-color--yellow",
    green: "group-color--green",
    pink: "group-color--pink",
    purple: "group-color--purple",
    cyan: "group-color--cyan",
    orange: "group-color--orange",
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

  function getGroupColorClass(group) {
    return GROUP_COLOR_CLASSES[group?.color] || GROUP_COLOR_CLASSES.grey;
  }

  function buildGroupSummaries(groups, tabs, tabStateModel) {
    return groups.map((group) => {
      const memberTabs = tabs.filter((tab) => tab.groupId === group.id);
      const discardedCount = memberTabs.filter(
        (tab) => tabStateModel.deriveTabState(tab) === tabStateModel.states.DISCARDED,
      ).length;

      return {
        groupId: group.id,
        title: getGroupTitle(group),
        color: getGroupColor(group),
        colorClass: getGroupColorClass(group),
        memberTabs,
        totalCount: memberTabs.length,
        awakeCount: memberTabs.length - discardedCount,
        discardedCount,
      };
    });
  }

  function createGroupMemberList(document, groupSummary, renderOptions) {
    const memberList = document.createElement("ul");
    memberList.className = "group-member-list tab-list";
    memberList.id = `group-members-${groupSummary.groupId}`;
    memberList.hidden = true;

    if (
      renderOptions.tabListRenderer &&
      renderOptions.tabStateModel &&
      renderOptions.onDiscardTab
    ) {
      renderOptions.tabListRenderer.renderTabList(
        memberList,
        groupSummary.memberTabs,
        renderOptions.tabStateModel,
        renderOptions.onDiscardTab,
        renderOptions.discardPolicy,
      );
    }

    return memberList;
  }

  function createGroupRow(document, groupSummary, onDiscardGroup, renderOptions) {
    const row = document.createElement("li");
    row.className = "group-row";

    const header = document.createElement("div");
    header.className = "group-row-header";

    const color = document.createElement("span");
    color.className = `group-color ${
      groupSummary.colorClass || GROUP_COLOR_CLASSES.grey
    }`;
    color.setAttribute("aria-hidden", "true");
    header.append(color);

    const details = document.createElement("div");
    details.className = "group-details";

    const title = document.createElement("h3");
    title.className = "group-title";
    title.id = `group-title-${groupSummary.groupId}`;
    title.textContent = groupSummary.title;
    details.append(title);

    const summary = document.createElement("span");
    summary.className = "group-summary";
    summary.textContent = `${groupSummary.totalCount} tabs · ${groupSummary.awakeCount} awake · ${groupSummary.discardedCount} discarded`;
    details.append(summary);

    header.append(details);

    const memberList = createGroupMemberList(
      document,
      groupSummary,
      renderOptions,
    );
    memberList.setAttribute("aria-labelledby", title.id);

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
      expandAction.textContent = expanded ? "▲" : "▼"; 
    }

    setExpanded(false);
    expandAction.addEventListener("click", () => {
      setExpanded(memberList.hidden);
    });
    const action = document.createElement("button");
    action.className = "group-discard-action";
    action.type = "button";
    action.textContent = "Discard group";
    action.addEventListener("click", async () => {
      action.disabled = true;
      action.textContent = "Discarding…";

      try {
        await onDiscardGroup(groupSummary.groupId);
      } finally {
        action.disabled = false;
        action.textContent = "Discard group";
      }
    });
    const actions = document.createElement("div");
    actions.className = "group-actions";
    actions.append(expandAction, action);
    header.append(actions);

    row.append(header, memberList);

    return row;
  }

  function renderGroupList(
    container,
    groupSummaries,
    onDiscardGroup,
    renderOptions = {},
  ) {
    container.replaceChildren();

    for (const groupSummary of groupSummaries) {
      container.append(
        createGroupRow(
          container.ownerDocument,
          groupSummary,
          onDiscardGroup,
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
    getGroupColorClass,
    buildGroupSummaries,
    renderGroupList,
  });

  globalScope.tabDiscarderGroupList = groupListRenderer;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = groupListRenderer;
  }
})(globalThis);
