import Turn from 'node-turn';

/**
 * Optional built-in TURN relay for local testing. Phones on the same Wi-Fi or
 * hotspot often cannot reach each other directly (Android hotspot hosts and
 * carrier NAT block it), so media is relayed through this machine instead.
 */
export function startTurnServer() {
  if (process.env.TURN_ENABLED === 'false') return null;

  const port = Number(process.env.TURN_PORT || 3478);
  const username = process.env.TURN_USERNAME || 'camora';
  const password = process.env.TURN_PASSWORD || 'camora';

  const turn = new Turn({
    listeningPort: port,
    authMech: 'long-term',
    credentials: { [username]: password },
    realm: 'camora',
    debugLevel: 'ERROR',
  });
  turn.start();
  console.log(`[camora] TURN relay listening on udp :${port} (user "${username}")`);
  return turn;
}
