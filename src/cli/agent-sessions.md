# 에이전트 세션 CLI

화면 없이 실행 호스트의 대화를 읽거나 조작하려면 `orca agent session`을 사용합니다. 공급자의 기존 기록은 `orca agent history`로 조회합니다. 각 명령은 실행 호스트 하나를 대상으로 합니다. 원격 호스트는 `--environment <id>` 또는 `--pairing-code <code>`로 선택하며, workspace에는 Git worktree와 folder selector를 모두 사용할 수 있습니다.

`orca agent session agents --json`은 등록된 에이전트를 나열합니다. `orca agent session create-support --worktree folder:<id> --agent codex --json`은 해당 호스트의 생성 지원 여부를 확인합니다.

`orca agent session history --session <id> --direction tail --limit 40 --json`은 대화의 최근 기록을 읽습니다. 이전·이후 페이지는 `before`·`after`와 응답의 `epoch`·`sequence` 객체를 `--cursor`에 전달해 읽습니다. `options`·`commands`·`outline`·`handoff-status`도 `--session`으로 대상을 지정합니다. 조회는 공급자 프로세스를 시작하지 않습니다.

동작 요청은 `--request-file <path>`로 로컬 UTF-8 JSON 파일을 읽거나 `--request-file -`로 piped stdin에서 받습니다. 입력 상한은 1 MiB입니다. 요청 안의 transcript·image 경로는 실행 호스트의 경로입니다. 비밀 본문은 argv 대신 파일이나 stdin으로 전달합니다. 잘못된 UTF-8 입력은 호스트 호출 전에 거부하며 입력 오류는 본문을 출력하지 않습니다.

| 명령                                                | 요청 필드                                                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent session create`                              | `envelope`, `worktree`, `agent`, 선택 필드 `resumeFrom: {providerSessionId}` and `tabId`                                                                                 |
| `agent session send`                                | `envelope`, `body: {kind: "message", role: "user", blocks: [...]}`, 선택 필드 `delivery: "queue-if-active"`, `retryUnknown: true`                                        |
| `agent session cancel`                              | `envelope`, 선택 필드 `turnId`, `scope: "background-tasks"`, `taskId`, 또는 `prompt: {itemId, expectedRevision}`; task는 scope와 turn을, prompt는 turn을 함께 지정합니다 |
| `agent session respond-approval`                    | `envelope`, `itemId`, `expectedRevision`, `optionId`                                                                                                                     |
| `agent session respond-question`                    | `envelope`, `itemId`, `expectedRevision`, 둘 중 하나만 `optionId` 또는 `answers: [{questionId, optionIds, other?}]`                                                      |
| `agent session set-option`                          | `envelope`, `key`, `value`                                                                                                                                               |
| `agent session conversation-command`                | `envelope`, `command: "clear"` 또는 `"compact"`                                                                                                                          |
| `agent session rewind`                              | `envelope`, `itemId`, `expectedEpoch`                                                                                                                                    |
| `agent session thread-goal`                         | `envelope`, `change: {kind: "set", objective}` 또는 `{kind: "status", status: "active"\|"paused"}` 또는 `{kind: "clear"}`                                                |
| `agent session queued-send`, `queued-delete`        | `envelope`, `messageId`                                                                                                                                                  |
| `agent session queued-resume`                       | `envelope`                                                                                                                                                               |
| `agent session model-catalog`                       | `agent`, 선택 필드 `sessionId`, `worktree`, `waitForListing`                                                                                                             |
| `agent session restart-dismiss`, `restart-continue` | 선택 필드 `sessionIds`; 생략하면 이 클라이언트에 보이는 모든 제안을 대상으로 합니다                                                                                      |
| `agent history list`                                | 선택 필드 `limit`, `unlimited`, `force`, `scopePaths`, `includeAntigravityIdeSessions`, `executionHostId`                                                                |
| `agent history titles`                              | `requests: [{agent: "claude"\|"codex", sessionId, transcriptPath?}]`                                                                                                     |
| `agent history resume-plan`                         | `agent`, `filePath`, `codexHome` (path 또는 null), 선택 필드 `sessionId`                                                                                                 |
| `agent history read`                                | `agent`, `sessionId`, 선택 필드 `transcriptPath`, `limit`, `beforeOffset`                                                                                                |

`agent session restart-list`는 요청 파일 없이 재개 제안과 실패 목록을 읽습니다. `agent history resume-plan`은 재개를 준비하며 공급자를 시작하지 않습니다. 기록 본문 검색에는 `orca search`를 사용합니다.

메시지 block은 `{type: "text", text}` 또는 `{type: "image-ref", path?, url?, alt?}`입니다. 이미지는 path와 url 중 하나만 지정합니다.

변경 요청의 envelope에는 `sessionId`·`clientOperationId`·`expectedRuntimeFence`·`payloadFingerprint`가 필요합니다. 생성의 fence는 null이며 다른 변경은 관측한 양의 fence를 전달합니다. fingerprint는 기존 `computeAgentSessionPayloadFingerprint` 계약대로 `{method, sessionId, fields}`를 재귀적으로 key 정렬해 직렬화한 JSON의 SHA-256입니다. fields에는 envelope를 제외한 해당 동작의 fingerprint 대상 필드를 넣습니다. `retryUnknown`은 fingerprint 대상이 아니며, send의 `delivery`는 지정한 경우 대상에 포함합니다.

승인과 질문의 fingerprint method는 RPC 이름과 달리 각각 `agentSession.respondTo:approval`·`agentSession.respondTo:question`입니다. fields는 `itemId`·`expectedRevision`과 요청한 `optionId` 또는 `answers`입니다. 나머지 동작은 대응하는 `agentSession.*` method 이름을 사용합니다. 생성 fields는 `worktree`·`agent`와 지정한 `resumeFrom`·`tabId`이며, queued-resume은 빈 객체입니다.

결과가 불명확해 재시도할 때는 같은 요청과 envelope를 유지합니다. 본문을 바꾸면 새 operation ID와 fingerprint가 필요합니다. 호스트가 요청을 수락했다는 응답은 공급자의 작업 완료를 뜻하지 않으며, 완료 결과는 history로 확인합니다. 권한·소유권·revision 검사는 기존 호스트가 수행합니다. 구버전 호스트에서 method나 capability가 없으면 오류를 반환하며, 다른 호스트나 터미널로 재시도하지 않습니다.

`agent session close --session <id>`는 공급자 child와 열린 view를 닫고 대화 기록은 보존합니다. `reveal --session <id>`는 호스트의 기존 기록에서 탭을 다시 게시합니다.

`agent terminal create`와 `agent terminal ensure`는 `--request-file`로 기존 host-owned terminal session 요청을 받습니다. create에는 `clientOperationId`·`worktree`·`agent`를 지정하고 prompt·promptDelivery·agentArgs·launchPreferences·startupCwd·presentation·placement·viewMode를 선택할 수 있습니다. operation ID는 기존 timestamp-hex 계약을 따르며 재시도 때 유지합니다. ensure는 `{kind: "explicit", worktree, agent, providerSession: {key, id, transcriptPath?}}` 또는 `{kind: "automatic", sleepingCheckpointId}`를 받습니다. provider별 resume 지원은 호스트가 검사합니다.

`agent status list --json`은 대상 호스트의 canonical hook store에서 상태 메타데이터와 관측 시각을 읽습니다. launch token·prompt·tool input·응답 본문은 내보내지 않습니다. SSH 행의 connectionId와 restoredUnconfirmed를 보존하며, 저장된 상태를 프로세스 생존 판정으로 바꾸지 않습니다. `agent status dismiss --request-file <path|->`에 조회한 `{paneKey, receivedAt, stateStartedAt}`를 전달하면 같은 행만 닫습니다. 새 상태가 도착했으면 거부합니다. 프로세스는 종료하지 않습니다. `agent status migration --json`은 stable pane ID로 이전하지 못한 행을 읽습니다.

`agent history delete`는 `{agent, filePath, sessionId?}`를 받아 기존 휴지통 서비스와 companion 삭제·캐시 무효화를 수행합니다. 삭제 가능한 공급자와 알려진 transcript root만 허용하며 path kind·symlink 검사를 유지합니다. 거부나 실패는 종료 코드 1입니다. `agent history subagents`는 `{agent: "claude"|"omp", parentFilePath}`를 받으며 기존 root 검증 후 목록을 읽습니다. 두 명령은 주소 지정한 실행 호스트의 로컬 경로만 다룹니다. 다른 호스트 ID를 요청에 넣으면 거부합니다. 기존 mobile scope pairing은 새 관리 RPC를 허용하지 않으므로 runtime scope의 인증을 사용합니다.

터미널 상세 요청도 `--request-file`을 사용합니다. `terminal clear`·`reset-input`·`identity`·`agent-status`·`restore-fit`·`display-mode`는 `{terminal}`을 받습니다. clear와 reset-input은 프로세스를 종료하지 않습니다. `inspect-process`는 `{terminal, expectedIncarnationId?, scanChildProcesses?}`로 실행 호스트의 `live`·`unverifiable`·`exited` 증거를 조회합니다. `set-display-mode`는 `{terminal, mode: "auto"|"desktop", client?, viewport?}`를 받습니다.

`terminal tabs`는 `{worktree}`를 받습니다. `move-tab`은 `{worktree, tabId, targetGroupId}`에 `kind: "reorder"`와 tabOrder, `kind: "move-to-group"`과 선택 index, 또는 `kind: "split"`과 splitDirection을 지정합니다. `set-tab`은 `{worktree, tabId, color?, isPinned?, viewMode?}`이며 null color는 색을 해제합니다. `set-layout`은 `{worktree, tabId, root, expandedLeafId?, chatLeafId?, titlesByLeafId?}`를 받습니다. root는 null 또는 leaf/split tree이며 기존 깊이·노드 상한을 적용합니다. 기존 session.tabs 서비스의 수락 응답은 desktop viewer 반영 확인을 제공하지 않으므로 화면 반영 완료의 근거로 사용하지 않습니다.

`terminal daemon list --json`은 주소 지정한 runtime의 native·WSL daemon 목록을 읽습니다. SSH relay 프로세스는 이 목록에 포함되지 않습니다. 응답의 observations에는 각 protocolVersion의 조회 상태가 있으며 연결 실패는 `unverifiable`로 남습니다. `complete:false`인 목록을 빈 호스트의 증거로 사용하지 않습니다. agent ownership record와 credential은 출력하지 않습니다.

`terminal daemon stop --request-file <path|->`는 조회한 `{sessionId, incarnationId, protocolVersion, confirm:true}`를 받습니다. 해당 daemon이 생성 식별값 검증 기능을 협상하지 않았거나 식별값이 바뀌었으면 거부하며 다른 daemon으로 대체하지 않습니다. 종료 후 소유 daemon을 다시 조회해 `live`·`unverifiable`·`exited`를 구분합니다. `exited`가 아니면 종료 코드 1과 error.data에 판정 근거를 반환합니다.

`terminal daemon stop-many --request-file <path|->`는 `{targets: [...]}`로 1–256개의 명시적 종료 대상을 받습니다. 각 대상에 같은 식별값과 확인 필드가 필요합니다. 새로 생긴 세션은 자동으로 추가하지 않습니다. 일부 거부나 연락 두절이 있어도 각 대상의 판정을 보존하고 전체 성공으로 출력하지 않습니다. 이 명령들은 daemon 자체를 재시작하지 않습니다.

작업공간의 hook은 `agent hooks workspace-check`·`setup-imports`로 조회하며 `--request-file`에 `{repo}`를 전달합니다. 검사 실패는 오류로 반환하고 스크립트를 실행하지 않습니다. folder workspace에는 Git repository hook이 없습니다. `agent hooks issue-read`는 같은 요청으로 private override와 shared command를 읽습니다. 이 조회의 출력에는 요청한 명령 본문이 포함됩니다.

`agent hooks issue-write`는 `{repo, content}`를 파일이나 stdin으로 받아 실행 호스트의 private override를 저장합니다. 빈 content는 override를 지워 shared command를 다시 적용합니다. 이 명령은 스크립트를 실행하거나 저장한 본문을 출력하지 않습니다. Git repository workspace에서만 지원하며 SSH filesystem이 없거나 private override의 ignore 보호를 저장할 수 없으면 실패합니다.

orchestration 메시지 본문은 `orca orchestration send --subject <text> --body-file <path|->` 또는 `orca orchestration reply --id <message-id> --body-file <path|->`로 전달합니다. 파일은 CLI를 실행한 클라이언트에서 읽으며 UTF-8 일반 파일과 최대 1 MiB를 허용합니다. `-`는 파이프로 전달한 stdin입니다. `--body`와 함께 사용할 수 없습니다. 기존 `--body`는 호환을 위해 유지하므로 비공개 본문에는 파일·stdin을 사용합니다.

send·reply의 성공 응답은 메시지 ID를 포함한 영수증이며 본문·payload를 출력하지 않습니다. 본문이 필요한 경우 명시적으로 inbox를 조회합니다. 동일 발송을 재개할 때는 같은 `--retry-request <id>`를 사용합니다.

터미널의 비공개 입력은 `orca terminal send --terminal <handle> --text-file <path|->`로 전달합니다. CLI가 읽는 UTF-8 일반 파일 또는 piped stdin이며, 기존 터미널 입력 상한인 16 MiB를 적용합니다. `--text`와 함께 사용할 수 없습니다. `--enter`·`--wait-submit`·`--retry-request`의 기존 실행 호스트 확인과 재시도 계약은 동일합니다.

`orca agent awake status --json`은 실행 호스트의 기존 Awake 서비스가 가진 `mode`와 `active`를 읽습니다. 조회는 모드나 절전 방지 상태를 변경하지 않습니다. 서비스가 없는 호스트에서는 `agent_awake_unavailable`로 실패합니다.

`orca terminal fit-overrides --json`은 실행 호스트의 현재 fit 크기를 읽고, `orca terminal drivers --json`은 입력·크기 제어권 소유자를 읽습니다. 두 조회는 터미널 크기나 제어권을 변경하지 않습니다.
