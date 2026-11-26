import { Socket } from 'node:net';

// Application-side guard against accidental external provider calls.
// This supplements, rather than replaces, the disposable CI environment.
if (process.env.BOM_TRATO_E2E !== '1') {
  throw new Error('The E2E socket guard requires explicit opt-in');
}

const connect = Socket.prototype.connect;

Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const port = typeof first === 'object' && first !== null ? first.port : first;
  let host;

  if (typeof first === 'object' && first !== null) {
    host = first.host;
  } else if (typeof args[1] === 'string') {
    host = args[1];
  }

  if (host !== '127.0.0.1' || Number(port) !== 5432) {
    throw new Error('External TCP connections are disabled in full-stack E2E');
  }

  return Reflect.apply(connect, this, args);
};
