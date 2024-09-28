import { type EventEmitter2 } from 'eventemitter2';
import Module from 'node:module';

const require = Module.createRequire(import.meta.url);

export const EventEmitter = require('eventemitter2').EventEmitter2 as typeof EventEmitter2;
