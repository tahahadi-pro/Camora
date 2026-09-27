import { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export type NetworkInfo = {
  isConnected: boolean;
  type: string;
  details: string;
};

function describe(state: NetInfoState): NetworkInfo {
  const type = String(state.type || 'unknown');
  let details = type;

  if (type === 'cellular' && state.details && 'cellularGeneration' in state.details) {
    const gen = state.details.cellularGeneration;
    details = gen ? `${String(gen).toUpperCase()} cellular` : 'cellular';
  } else if (type === 'wifi') {
    details = 'Wi-Fi';
  } else if (type === 'none') {
    details = 'No Internet';
  }

  return {
    isConnected: Boolean(state.isConnected && state.isInternetReachable !== false),
    type,
    details,
  };
}

export function useNetworkStatus() {
  const [network, setNetwork] = useState<NetworkInfo>({
    isConnected: true,
    type: 'unknown',
    details: 'Checking…',
  });
  const wasConnected = useRef(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setNetwork(describe(state));
    });
    NetInfo.fetch().then((state) => setNetwork(describe(state)));
    return unsub;
  }, []);

  const onReconnect = useCallback(
    (handler: () => void) => {
      if (!wasConnected.current && network.isConnected) {
        handler();
      }
      wasConnected.current = network.isConnected;
    },
    [network.isConnected],
  );

  return { network, onReconnect };
}
