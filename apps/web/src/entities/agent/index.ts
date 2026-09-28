export {
  agentKeys,
  agentPath,
  LOCKED_POLL_MS,
  mergeIntoAgent,
  retryAgentCall,
  useAgent,
  usePauseAgent,
} from './api/agent';
export {
  useAgreeConsent,
  useAttestX,
  useAuthorizeX,
  useConsentText,
  useDisconnectX,
  useXConnection,
} from './api/x-connection';
export { readXReturn } from './lib/x-return';
export { PERSONA_PARTS, personaComplete, type Agent, type AgentEdit, type PersonaPart } from './model/agent';
export { describeAgentError, type AgentErrorCopy } from './model/agent-error';
export { agentStatus, type AgentState, type AgentStatus } from './model/agent-status';
export type { ConnectionGate, ConsentText, XConnection } from './model/x-connection';
