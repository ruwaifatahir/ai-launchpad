import { useMutation, useQueryClient } from '@tanstack/react-query';
import { agentKeys, agentPath, mergeIntoAgent, type Agent, type AgentEdit } from '@/entities/agent';
import { apiRequest } from '@/shared/api';

type EditReply = Pick<Agent, 'token' | 'name' | 'personality' | 'lore' | 'style' | 'topics' | 'pace'> & {
  updatedAt: string;
};

/**
 * Saves the Persona, Topics and Pace. Not optimistic, since trimming and the limits can still refuse
 * a value; the reply is merged into the cached Agent once it lands.
 */
export function useEditAgent(token: string, wallet: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentEdit) => apiRequest<EditReply>(agentPath(token), { method: 'PATCH', body }),
    onSuccess: (reply) => mergeIntoAgent(queryClient, agentKeys.detail(token, wallet), reply),
  });
}
