
import { LogEntry } from '../types';

type LogListener = (entry: LogEntry) => void;

class LoggerService {
  private static instance: LoggerService;
  private listeners: Set<LogListener> = new Set();
  private history: LogEntry[] = [];

  private constructor() { }

  static getInstance() {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  subscribe(listener: LogListener) {
    this.listeners.add(listener);
    // 发送历史记录给新订阅者
    this.history.forEach(listener);
    return () => this.listeners.delete(listener);
  }

  log(level: LogEntry['level'], message: string, nodeId?: string, nodeTitle?: string) {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      level,
      message,
      nodeId,
      nodeTitle
    };
    this.history.push(entry);
    if (this.history.length > 200) this.history.shift(); // 保持最近200条
    this.listeners.forEach(l => l(entry));

    // 同时打印到浏览器控制台以便调试
    const styles = {
      info: 'color: #3b82f6',
      warn: 'color: #eab308',
      error: 'color: #ef4444',
      success: 'color: #22c55e'
    };
    console.log(`%c[${entry.timestamp.toLocaleTimeString()}] ${message}`, styles[level]);
  }

  info(msg: string, nid?: string, nt?: string) { this.log('info', msg, nid, nt); }
  warn(msg: string, nid?: string, nt?: string) { this.log('warn', msg, nid, nt); }
  error(msg: string, nid?: string, nt?: string) { this.log('error', msg, nid, nt); }
  success(msg: string, nid?: string, nt?: string) { this.log('success', msg, nid, nt); }

  clear() {
    this.history = [];
    // 强制触发一次空更新（可选）
  }

  getHistory(): LogEntry[] {
    return [...this.history];
  }
}

export const logger = LoggerService.getInstance();
