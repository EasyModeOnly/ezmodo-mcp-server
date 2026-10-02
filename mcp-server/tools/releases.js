/**
 * Release Readiness tool definitions (E-262).
 *
 * The model: a MILESTONE is the release target (v1.4.0). A release CANDIDATE is
 * one build of it (1.4.0-rc.2), promoted through the project's environments.
 * The CHECKLIST is the human steps; GATES are the machine checks per
 * environment; READINESS combines them into go / no_go / go_with_waivers with a
 * reason on every row. A WAIVER is how a release goes out incomplete on purpose.
 *
 * E-280: a RELEASE is a DELIVERABLE (api, web, desktop — what the project
 * ships on its own version line) at a version. Candidates are builds of a
 * release. A milestone is optional planning the release can point at. Every
 * project has a default deliverable, so the milestone-first actions keep
 * working. Deliverables are a release axis only: work is never linked to them.
 *
 * Nothing here assumes a CI provider: pipelines report checks and deployments
 * with manage_release report_check / report_deployment (or `ezmodo release
 * report`), and GitHub data is read automatically when a candidate has a SHA.
 */

export const RELEASE_TOOLS = [
  {
    name: 'get_release_readiness',
    description: 'Answer "what is blocking this release?". Modes: ' +
      '(1) candidateId + environment → the go/no-go for that candidate in that environment: verdict ' +
      '(go | go_with_waivers | no_go), every gate with status and reason, the checklist, waivers, and nextAction ' +
      '(the single next step). Blocking rows carry howToWaive. ' +
      '(2) candidateId alone → the readiness matrix: the same for every environment on its deliverable\'s route. ' +
      'Instead of candidateId, name the build as deliverable + version (+ candidate label): the release\'s newest ' +
      'candidate that was not rejected, or the one with that label (deliverable omitted = the project\'s default; ' +
      'projectId defaults to .ezmodo/config.json). ' +
      '(3) releaseId → the release page: route environments, candidates, checklist, contents and effective gates. ' +
      '(4) milestoneId (+ deliverable?) → the milestone\'s release overview: environments, candidates with their ' +
      'promotions, the checklist and the gates. Set listGateTypes to get the gate types and their params instead. ' +
      'Environment accepts an id, key or alias ("prod", "stage").',
    inputSchema: {
      type: 'object',
      properties: {
        candidateId: { type: 'string', description: 'Release candidate id (modes 1 and 2)' },
        environment: { type: 'string', description: 'Environment id, key or alias (mode 1)' },
        deliverable: {
          type: 'string', description: 'Deliverable key or id (modes 1, 2 and 4); omitted = the project\'s default',
        },
        version: {
          type: 'string', description: 'Release version, e.g. "0.23.0" — with deliverable, names the build (modes 1 and 2)',
        },
        candidate: {
          type: 'string', description: 'Candidate label or id within that release (default: its newest active one)',
        },
        projectId: {
          type: 'string', description: 'Project id for the deliverable + version lookup (default: .ezmodo/config.json)',
        },
        releaseId: { type: 'string', description: 'Release id (mode 3)' },
        milestoneId: { type: 'string', description: 'Milestone id (mode 4)' },
        listGateTypes: { type: 'boolean', description: 'Return the available gate types and their params' },
      },
    },
  },
  {
    name: 'manage_release',
    description: 'Work a release through: create release candidates, promote them, tick the checklist, waive, ' +
      'sign off, configure gates, and report checks/deployments from any pipeline. Promote is REFUSED while a required ' +
      'or reject gate fails (the error lists each blocking gate and how to waive it); there is no force — fix it or ' +
      'waive it with a reason. Enforcement: required blocks promotion; advisory only warns; reject is like required, ' +
      'and a definite failure (never pending) rejects the candidate; only gate types with canReject (suite_pass_rate, ' +
      'external_check, deployed_to_previous, checklist_phase) accept it. A rejected candidate cannot be promoted. Actions: ' +
      'create_candidate (releaseId, or version + deliverable? — the release is started if new and the label ' +
      'defaults to the version — or milestoneId + versionLabel + deliverable?; kind?, commitSha?, notes?); ' +
      'update_candidate (candidateId, notes?, commitSha?, status: active|rejected|shipped, rejectionReason? — ' +
      'recorded with a rejection; setting active again clears the rejection); ' +
      'promote (candidateId, environment, notes?); ' +
      'sign_off (candidateId, environment, note?); ' +
      'waive (candidateId, environment, targetType: gate|checklist_item|epic, targetId, reason, ' +
      'evidenceType?: none|link|note|feature_flag, evidence?: {url}|{text}|{flagKey}) — feature_flag evidence is ' +
      'verified: the flag must be served OFF in that environment, or the waiver does not hold; ' +
      'revoke_waiver (waiverId); ' +
      'apply_checklist (milestoneId, templateId? — default: the project\'s default, else the built-in one); ' +
      'add_checklist_item (milestoneId, title, phase, ownerId?, ownerName?, notes?, runbookUrl?, autoCheck?); ' +
      'set_item_state (itemId, state: open|done|failed|waived|n_a, note? — required for waived, candidateId? — ' +
      'failed means the step was done and did not pass: it fails its phase gate, and when that phase is set to ' +
      'reject it rejects the candidate (a per-candidate step\'s own, else candidateId, else every active candidate ' +
      'of the milestone)); ' +
      'update_checklist_item (itemId, title?, notes?, ownerId?, ownerName?, runbookUrl?, position?, autoCheck?, ' +
      'clearAutoCheck? — edits one milestone\'s step; its state goes through set_item_state. The project\'s ' +
      'process lives in its template, so change that with save_template); ' +
      'delete_checklist_item (itemId — removes a step from the milestone; a per-candidate step takes its ' +
      'candidates\' copies with it); ' +
      'item_to_task (itemId — turns a checklist item into a task; completing the task ticks it); ' +
      'add_gate (projectId, environment, type, name?, params?, enforcement?: required|advisory|reject); ' +
      'update_gate (gateId, name?, params?, enforcement?, enabled?); delete_gate (gateId); ' +
      'add_recommended_gates (projectId — adds the recommended checks each environment after the first is ' +
      'missing; existing gates are left alone); ' +
      'list_gates (projectId, environment? — every automatic check, with ids for update_gate/delete_gate; a ' +
      'checklist_phase gate with params.phase is what makes that phase of steps block promotion); ' +
      'list_templates (projectId — step templates: built-in, organization and project; the project\'s isDefault ' +
      'one is its release process); ' +
      'get_settings / save_settings (projectId, completeTasksOn: last_environment|milestone_released|' +
      'any_environment — when a release completes the in-review tasks it ships); ' +
      'save_template (projectId, name, items[], templateId? to replace, isDefault?, orgWide?); ' +
      'report_check (projectId, name, status: pending|running|success|failure|cancelled|skipped, ' +
      'candidate? (id or version label), commitSha?, environment?, url?, source?, externalId?); ' +
      'report_deployment (projectId, environment, status: pending|in_progress|success|failure|cancelled, ' +
      'candidate?, commitSha?, url?, source?, externalId?). Reports are idempotent: sending the same one again ' +
      'updates it. Both reports also take deliverable + version to name the build (with candidate? as a label ' +
      'within that release). ' +
      'RELEASES (E-280) — a release is a deliverable (see manage_deliverable) at a version; projectId defaults to ' +
      '.ezmodo/config.json, and deliverable omitted means the project\'s default one. A release is named by ' +
      'releaseId or by deliverable + version: ' +
      'list_releases (projectId?, deliverable?, milestoneId?, limit? — each with its candidates and the furthest ' +
      'environment it reached); ' +
      'create_release (version, deliverable?, milestoneId?, notes? — returns the existing release at that version ' +
      'if there is one); ' +
      'get_release (the release page: route environments, candidates, checklist, contents, effective gates); ' +
      'update_release (status?: planned|in_progress|shipped|abandoned, milestoneId? ("" detaches), notes?); ' +
      'get_contents / derive_contents (the tasks and epics this release ships, derived from the newest candidate\'s ' +
      'commits; derive keeps manual edits); add_content / remove_content (entityType: task|epic, entityId — a ' +
      'removed item stays out on re-derive); release_changelog (markdown); ' +
      'task_shipping (taskId, projectId? — which deliverables have shipped the task: "API shipped, Web pending"). ' +
      'apply_checklist and add_checklist_item also take releaseId instead of milestoneId; add_gate, list_gates, ' +
      'get_settings, save_settings and save_template take deliverable for that deliverable\'s own gates, settings ' +
      'and templates (save_settings with deliverable and completeTasksOn "" removes its override).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'create_candidate', 'update_candidate', 'promote', 'sign_off', 'waive', 'revoke_waiver',
            'apply_checklist', 'add_checklist_item', 'set_item_state', 'update_checklist_item',
            'delete_checklist_item', 'item_to_task',
            'add_gate', 'update_gate', 'delete_gate', 'add_recommended_gates', 'list_gates',
            'list_templates', 'save_template', 'get_settings', 'save_settings',
            'report_check', 'report_deployment',
            'list_releases', 'create_release', 'get_release', 'update_release', 'get_contents', 'derive_contents',
            'add_content', 'remove_content', 'release_changelog', 'task_shipping',
          ],
          description: 'Action to perform',
        },
        projectId: {
          type: 'string',
          description: 'Project id (add_gate, add_recommended_gates, list_gates, list_templates, save_template, ' +
            'get_settings, save_settings, report_*)',
        },
        milestoneId: { type: 'string', description: 'Milestone id (create_candidate, apply_checklist, add_checklist_item)' },
        candidateId: { type: 'string', description: 'Release candidate id' },
        candidate: { type: 'string', description: 'Candidate id OR version label (report_check, report_deployment)' },
        environment: { type: 'string', description: 'Environment id, key or alias' },
        versionLabel: { type: 'string', description: 'e.g. "1.4.0-rc.2" (create_candidate)' },
        kind: { type: 'string', enum: ['alpha', 'beta', 'rc', 'ga'], description: 'Inferred from the label when omitted' },
        commitSha: { type: 'string', description: 'Commit the candidate was built from. Optional: projects with no git still ship.' },
        notes: { type: 'string' },
        note: { type: 'string', description: 'sign_off note, or the reason when set_item_state waives or marks n_a' },
        status: { type: 'string', description: 'update_candidate / report_check / report_deployment status' },
        rejectionReason: { type: 'string', description: 'update_candidate with status rejected: why it will not ship (reason also works)' },
        targetType: { type: 'string', enum: ['gate', 'checklist_item', 'epic'] },
        targetId: { type: 'string' },
        reason: { type: 'string', description: 'Why this is going out anyway (waive). Shown on the release record and changelog.' },
        evidenceType: { type: 'string', enum: ['none', 'link', 'note', 'feature_flag'] },
        evidence: {
          type: 'object',
          description: '{url} for link, {text} for note, {flagKey} (or {flagId}) for feature_flag',
          properties: {
            url: { type: 'string' }, text: { type: 'string' }, flagKey: { type: 'string' }, flagId: { type: 'string' },
          },
        },
        waiverId: { type: 'string' },
        templateId: { type: 'string' },
        itemId: { type: 'string' },
        title: { type: 'string' },
        phase: { type: 'string', enum: ['planning', 'freeze', 'per-candidate', 'pre-prod', 'post-release'] },
        ownerId: { type: 'string' },
        ownerName: { type: 'string' },
        runbookUrl: { type: 'string' },
        autoCheck: { type: 'object', description: 'A gate expression {type, params}: the item counts as done while it passes' },
        clearAutoCheck: { type: 'boolean', description: 'update_checklist_item: remove the step\'s auto-check' },
        position: { type: 'number', description: 'update_checklist_item: sort position on the milestone\'s checklist (lower comes first)' },
        state: { type: 'string', enum: ['open', 'done', 'failed', 'waived', 'n_a'] },
        gateId: { type: 'string' },
        type: { type: 'string', description: 'Gate type (add_gate); see get_release_readiness listGateTypes' },
        name: { type: 'string', description: 'Gate / template / check name' },
        params: { type: 'object', description: 'Gate params' },
        enforcement: {
          type: 'string',
          enum: ['required', 'advisory', 'reject'],
          description: 'required blocks; advisory warns; reject: like required, and a definite failure rejects the candidate (only gate types with canReject)',
        },
        enabled: { type: 'boolean' },
        completeTasksOn: {
          type: 'string',
          enum: ['last_environment', 'milestone_released', 'any_environment'],
          description: 'save_settings: when a release completes the in-review tasks it ships',
        },
        items: { type: 'array', items: { type: 'object' }, description: 'save_template items: [{key?, title, phase, ownerId?, notes?, runbookUrl?, autoCheck?}]' },
        isDefault: { type: 'boolean' },
        orgWide: { type: 'boolean' },
        description: { type: 'string' },
        url: { type: 'string' },
        source: { type: 'string', description: 'Who is reporting: github, gitlab, jenkins, cli, manual… (report_*)' },
        externalId: { type: 'string', description: 'The pipeline\'s own id for this check/deployment; makes repeat reports update one row' },
        summary: { type: 'string' },
        deliverable: {
          type: 'string',
          description: 'Deliverable key or id (E-280). Omitted = the project\'s default deliverable',
        },
        version: { type: 'string', description: 'Release version, e.g. "0.23.0": with deliverable, names a release' },
        releaseId: { type: 'string', description: 'Release id (a deliverable at a version)' },
        limit: { type: 'number', description: 'list_releases: how many' },
        entityType: { type: 'string', enum: ['task', 'epic'], description: 'add_content / remove_content' },
        entityId: { type: 'string', description: 'add_content / remove_content: the task or epic id' },
        taskId: { type: 'string', description: 'task_shipping: the task' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_deliverable',
    description: 'Deliverables (E-280): what a project ships on its own version line — api, web, desktop. A ' +
      'release is a deliverable at a version (manage_release create_release / list_releases). HARD RULE: ' +
      'deliverables are a release axis only. Work is NEVER linked to a deliverable and a deliverable has no ' +
      'progress figure; work reaches a deliverable only through a release\'s contents. To say what a task or epic ' +
      'advances, link a feature instead. Every project has one default deliverable (created automatically), and ' +
      'everything deliverable-specific stays hidden while it is the only one (multi: false). ' +
      'projectId defaults to .ezmodo/config.json. A deliverable is named by key or id. Actions: ' +
      'list (→ {deliverables, multi}); ' +
      'create (name, key? — the name CI uses, ^[a-z0-9][a-z0-9._-]{0,62}$, route?, paths?); ' +
      'update (deliverable, name?, key?, position?, makeDefault?, route?, paths?); ' +
      'paths (deliverable, paths: repo-relative folders whose commits belong to it, mode?: add|remove|replace ' +
      '(default replace)) — used to derive a release\'s contents; the default deliverable with no paths is the ' +
      'whole repo; ' +
      'route (deliverable, route: environment ids or keys it is promoted through; [] = every environment); ' +
      'delete (deliverable — refused for the default and for any deliverable with releases).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'create', 'update', 'paths', 'route', 'delete'],
          description: 'Action to perform',
        },
        projectId: { type: 'string', description: 'Project id (default: .ezmodo/config.json)' },
        deliverable: { type: 'string', description: 'Deliverable key or id (update, paths, route, delete)' },
        key: { type: 'string', description: 'The name CI uses, e.g. "api" (create, update)' },
        name: { type: 'string', description: 'Display name, e.g. "API" (create, update)' },
        position: { type: 'number', description: 'update: sort position' },
        makeDefault: { type: 'boolean', description: 'update: make this the project\'s default deliverable' },
        route: {
          type: 'array',
          items: { type: 'string' },
          description: 'Environment ids or keys it is promoted through; [] = every environment (create, update, route)',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Repo-relative folders whose commits belong to it (create, update, paths)',
        },
        mode: {
          type: 'string', enum: ['add', 'remove', 'replace'], description: 'paths: how to apply them (default replace)',
        },
      },
      required: ['action'],
    },
  },
];
