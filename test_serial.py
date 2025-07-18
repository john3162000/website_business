import serial
import serial.tools.list_ports

# List all ports
ports = serial.tools.list_ports.comports()
print("Available ports:")
for port in ports:
    print(f"  {port.device}: {port.description}")

# Test connection
try:
    ser = serial.Serial('COM13', 9600, timeout=2)
    print(f" SUCCESS: Opened {ser.name}")
    ser.close()
except Exception as e:
    print(f" FAILED: {e}")