export class TournamentRoom {
  private sessions = new Set<WebSocket>();

  constructor(private state: DurableObjectState) {}

  async fetch(request: Request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private handleSession(socket: WebSocket) {
    socket.accept();
    this.sessions.add(socket);
    socket.send(JSON.stringify({ type: "room_ready", at: Date.now() }));

    socket.addEventListener("message", (event) => {
      const message = typeof event.data === "string" ? event.data : "";
      for (const session of this.sessions) {
        if (session.readyState === WebSocket.OPEN) session.send(message);
      }
    });

    const close = () => this.sessions.delete(socket);
    socket.addEventListener("close", close);
    socket.addEventListener("error", close);
  }
}
