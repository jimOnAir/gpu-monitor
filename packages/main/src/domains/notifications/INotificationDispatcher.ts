export interface INotificationDispatcher {
  show: (options: { title: string, body: string, icon?: string, silent: boolean }) => void;
}
