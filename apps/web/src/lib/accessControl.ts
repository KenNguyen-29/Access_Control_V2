export interface AccessPerson {
  id: string;
  name: string;
  personId: string;
  organization: string;
}

export interface AccessPoint {
  id: string;
  name: string;
  groupName: string;
}

export interface AccessGroup {
  id: string;
  name: string;
  scheduleTemplate: string;
  persons: AccessPerson[];
  accessPoints: AccessPoint[];
  status: 'pending' | 'applied' | 'partial' | 'failed';
}

export type AccessControlView = 'byPerson' | 'accessGroup' | 'search';
