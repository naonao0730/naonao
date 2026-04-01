export interface Account {
  id: string;
  name: string;
  token: string;
  cookie: string;
  created_at: number;
  last_used: number | null;
}

export interface Conversation {
  id: string;
  account_id: string;
  remote_id: string | null;
  model: string;
  title: string | null;
  created_at: number;
}

export interface Message {
  id: number;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
}

export interface ModelConfig {
  name: string;
  model: string;
  temperature: number;
  topP: number;
  thinkingDefaultOn: boolean;
  isDefault?: boolean;
  isNew?: boolean;
  isOmni?: boolean;
}

export interface ClawStatus {
  status: 'NOT_CREATED' | 'CREATING' | 'AVAILABLE' | 'DESTROYING' | 'DESTROYED';
  requestId?: string;
  expireTime?: number;
}

export interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size?: number;
}
