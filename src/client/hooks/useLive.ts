import { useEffect, useRef } from "react";

/** Calls `onChange` whenever the app says something at `path` changed. Reconnects after a drop. */
export function useLive(path: string | null, onChange: () => void) {
  const callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    if (!path) return;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const connect = () => {
      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${scheme}://${window.location.host}${path}`);
      socket.onmessage = (event) => {
        if (event.data === "changed") callback.current();
      };
      socket.onclose = () => {
        if (!stopped) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [path]);
}
