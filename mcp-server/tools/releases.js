/**
 * Release Readiness tool definitions (E-262).
 *
 * The model: a MILESTONE is the release target (v1.4.0). A release CANDIDATE is
 * one build of it (1.4.0-rc.2), promoted through the project's environments.
 * The CHECKLIST is the human steps; GATES are the machine checks per
 * environment; READINESS combines them into go / no_go / go_with_waivers with a
 * reason on every row. A WAIVER is how a release goes out incomplete on purpose.
 *
 * Nothing here assumes a CI provider: pipelines report checks and deployments
 * with manage_release report_check / report_deployment (or `ezmodo release
 * report`), and GitHub data is read automatically when a candidate has a SHA.
 */

export const RELEASE_TOOLS = [
  {
    name: 'get_release_readiness',
    description: 'Answer "what is blocking this release?". Three modes: ' +
      '(1) candidateId + environment → the go/no-go for that candidate in that environment: verdict ' +
      '(go | go_with_waivers | no_go), every gate with status and reason, the checklist, waivers, and nextAction ' +
      '(the single next step). Blocking rows carry howToWaive. ' +
      '(2) candidateId alone → the readiness matrix: the same for every environment in order. ' +
      '(3) milestoneId → the release overview: environments, candidates with their promotions, the checklist ' +
      'and the project\'s gates. Set listGateTypes to get the gate types and their params instead. ' +
      'Environment accepts an id, key or alias ("prod", "stage").',
    inputSchema: {
      type: 'object',
      properties: {
        candidateId: { type: 'string', description: 'Release candidate id (modes 1 and 2)' },
        environment: { type: 'string', description: 'Environment id, key or alias (mode 1)' },
        milestoneId: { type: 'string', description: 'Milestone id (mode 3)' },
        listGateTypes: { type: 'boolean', description: 'Return the available gate types and their params' },
      },
    },
  },
  {
    name: 'manage_release',
    description: 'Work a release through: cut candidates, promote them, tick the checklist, waive, sign off, ' +
      'configure gates, and report checks/deployments from any pipeline. Promote is REFUSED while a required ' +
      'gate fails (the error lists each blocking gate and how to waive it); there is no force — fix it or waive ' +
      'it with a reason. Actions: ' +
      'create_candidate (milestoneId, versionLabel, kind?, commitSha?, notes?); ' +
      'update_candidate (candidateId, notes?, commitSha?, status: active|rejected|shipped); ' +
      'promote (candidateId, environment, notes?); ' +
      'sign_off (candidateId, environment, note?); ' +
      'waive (candidateId, environment, targetType: gate|checklist_item|epic, targetId, reason, ' +
      'evidenceType?: none|link|note|feature_flag, evidence?: {url}|{text}|{flagKey}) — feature_flag evidence is ' +
      'verified: the flag must be served OFF in that environment, or the waiver does not hold; ' +
      'revoke_waiver (waiverId); ' +
      'apply_checklist (milestoneId, templateId? — default: the project\'s default, else the built-in one); ' +
      'add_checklist_item (milestoneId, title, phase, ownerId?, ownerName?, notes?, runbookUrl?, autoCheck?); ' +
      'set_item_state (itemId, state: open|done|waived|n_a, note? — required for waived); ' +
      'item_to_task (itemId — turns a checklist item into a task; completing the task ticks it); ' +
      'add_gate (projectId, environment, type, name?, params?, enforcement?: required|advisory); ' +
      'update_gate (gateId, name?, params?, enforcement?, enabled?); delete_gate (gateId); ' +
      'add_recommended_gates (projectId — a sensible starter set for environments with none); ' +
      'save_template (projectId, name, items[], templateId? to replace, isDefault?, orgWide?); ' +
      'report_check (projectId, name, status: pending|running|success|failure|cancelled|skipped, ' +
      'candidate? (id or version label), commitSha?, environment?, url?, source?, externalId?); ' +
      'report_deployment (projectId, environment, status: pending|in_progress|success|failure|cancelled, ' +
      'candidate?, commitSha?, url?, source?, externalId?). Reports are idempotent: sending the same one again ' +
      'updates it.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'create_candidate', 'update_candidate', 'promote', 'sign_off', 'waive', 'revoke_waiver',
            'apply_checklist', 'add_checklist_item', 'set_item_state', 'item_to_task',
            'add_gate', 'update_gate', 'delete_gate', 'add_recommended_gates', 'save_template',
            'report_check', 'report_deployment',
          ],
          description: 'Action to perform',
        },
        projectId: { type: 'string', description: 'Project id (add_gate, add_recommended_gates, save_template, report_*)' },
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
        state: { type: 'string', enum: ['open', 'done', 'waived', 'n_a'] },
        gateId: { type: 'string' },
        type: { type: 'string', description: 'Gate type (add_gate); see get_release_readiness listGateTypes' },
        name: { type: 'string', description: 'Gate / template / check name' },
        params: { type: 'object', description: 'Gate params' },
        enforcement: { type: 'string', enum: ['required', 'advisory'] },
        enabled: { type: 'boolean' },
        items: { type: 'array', items: { type: 'object' }, description: 'save_template items: [{key?, title, phase, ownerId?, notes?, runbookUrl?, autoCheck?}]' },
        isDefault: { type: 'boolean' },
        orgWide: { type: 'boolean' },
        description: { type: 'string' },
        url: { type: 'string' },
        source: { type: 'string', description: 'Who is reporting: github, gitlab, jenkins, cli, manual… (report_*)' },
        externalId: { type: 'string', description: 'The pipeline\'s own id for this check/deployment; makes repeat reports update one row' },
        summary: { type: 'string' },
      },
      required: ['action'],
    },
  },
];
