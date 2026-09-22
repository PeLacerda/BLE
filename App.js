import {
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const DEVICE_NAME = 'ESP32-CAM-Robot';
const SEND_INTERVAL_MS = 150;

const statusMap = {
  conectado: 'Conectado',
  procurando: 'Procurando',
  desconectado: 'Desconectado',
};

const isWebPlatform = Platform.OS === 'web';

const colors = {
  bg: '#0d1120',
  panel: '#151b2d',
  panel2: '#1d2740',
  card: '#1b2237',
  accent: '#9ed9ff',
  green: '#6ef0b4',
  red: '#ff7688',
  text: '#edf3ff',
  muted: '#a9b6d0',
  border: 'rgba(173, 190, 255, 0.18)',
};

function toBase64(text) {
  return Buffer.from(text, 'utf-8').toString('base64');
}

export default function App() {
  const bleManagerRef = useRef(null);
  const connectedDeviceRef = useRef(null);
  const sendIntervalRef = useRef(null);
  const statusRef = useRef('desconectado');

  const [connectionStatus, setConnectionStatus] = useState('desconectado');
  const [activeDir, setActiveDir] = useState('stop');

  useEffect(() => {
    statusRef.current = connectionStatus;
  }, [connectionStatus]);

  const requestPermission = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    }
  };

  useEffect(() => {
    if (isWebPlatform) return;

    bleManagerRef.current = new BleManager();
    requestPermission();

    return () => {
      stopSendingSignal();
      bleManagerRef.current?.destroy();
    };
  }, []);

  const sendSignal = async (payload) => {
    const device = connectedDeviceRef.current;
    if (!device) return;

    try {
      await device.writeCharacteristicWithoutResponseForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        toBase64(payload)
      );
    } catch (error) {
      console.log('Erro ao enviar comando:', error.message);
    }
  };

  const stopSendingSignal = () => {
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
  };

  const startCommand = (dirCode, dirLabel) => {
    setActiveDir(dirLabel);
    sendSignal(dirCode);
    stopSendingSignal();
    sendIntervalRef.current = setInterval(() => sendSignal(dirCode), SEND_INTERVAL_MS);
  };

  const stopCommand = () => {
    stopSendingSignal();
    setActiveDir('stop');
    sendSignal('S');
  };

  const connectToRobot = () => {
    if (isWebPlatform || !bleManagerRef.current) return;

    setConnectionStatus('procurando');

    bleManagerRef.current.startDeviceScan(null, null, async (error, device) => {
      if (error) {
        console.log('Erro no scan:', error);
        setConnectionStatus('desconectado');
        return;
      }

      if (device && device.name === DEVICE_NAME) {
        bleManagerRef.current.stopDeviceScan();

        try {
          const connected = await device.connect();
          await connected.discoverAllServicesAndCharacteristics();
          connectedDeviceRef.current = connected;
          setConnectionStatus('conectado');

          connected.onDisconnected(() => {
            setConnectionStatus('desconectado');
            connectedDeviceRef.current = null;
          });
        } catch (error) {
          Alert.alert('Erro ao conectar', error.message);
          setConnectionStatus('desconectado');
        }
      }
    });

    setTimeout(() => {
      if (statusRef.current !== 'conectado') {
        bleManagerRef.current?.stopDeviceScan();
      }
    }, 10000);
  };

  if (isWebPlatform) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.shell}>
          <View style={styles.noticeBox}>
            <Text style={styles.noticeTitle}>Compatibilidade</Text>
            <Text style={styles.noticeText}>Este app usa Bluetooth LE e precisa rodar em Android ou iOS nativo.</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.shell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>ROBOT</Text>
            <Text style={styles.title}>Controle remoto</Text>
          </View>

          <TouchableOpacity onPress={connectToRobot} style={styles.connectButton}>
            <Text style={styles.connectButtonText}>{statusMap[connectionStatus]}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={styles.statusValue}>{statusMap[connectionStatus]}</Text>
        </View>

        <View style={styles.padPanel}>
          <View style={styles.row}>
            <DirectionButton label="▲" dirCode="F" dirLabel="forward" activeDir={activeDir} onPress={startCommand} onRelease={stopCommand} />
          </View>

          <View style={styles.row}>
            <DirectionButton label="◀" dirCode="L" dirLabel="left" activeDir={activeDir} onPress={startCommand} onRelease={stopCommand} />
            <TouchableOpacity style={[styles.commandButton, styles.stopButton]} onPress={stopCommand}>
              <Text style={styles.commandText}>■</Text>
            </TouchableOpacity>
            <DirectionButton label="▶" dirCode="R" dirLabel="right" activeDir={activeDir} onPress={startCommand} onRelease={stopCommand} />
          </View>

          <View style={styles.row}>
            <DirectionButton label="▼" dirCode="B" dirLabel="backward" activeDir={activeDir} onPress={startCommand} onRelease={stopCommand} />
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function DirectionButton({ label, dirCode, dirLabel, activeDir, onPress, onRelease }) {
  const isActive = activeDir === dirLabel;

  return (
    <TouchableOpacity
      style={[styles.commandButton, isActive && styles.commandButtonActive]}
      onPressIn={() => onPress(dirCode, dirLabel)}
      onPressOut={onRelease}
      activeOpacity={0.85}
    >
      <Text style={styles.commandText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 26,
    paddingBottom: 20,
  },
  kicker: {
    color: colors.accent,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  connectButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectButtonText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  noticeBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    marginVertical: 80,
  },
  noticeTitle: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
  },
  noticeText: {
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  statusCard: {
    backgroundColor: colors.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 28,
  },
  statusLabel: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  statusValue: {
    color: colors.green,
    fontSize: 24,
    fontWeight: '700',
  },
  padPanel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(21, 27, 45, 0.92)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 26,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginVertical: 10,
  },
  commandButton: {
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commandButtonActive: {
    backgroundColor: '#202c49',
    borderColor: colors.accent,
  },
  stopButton: {
    backgroundColor: '#211827',
    borderColor: 'rgba(255, 118, 136, 0.55)',
  },
  commandText: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
});
