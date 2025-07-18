import serial
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime
import time

# ── CONFIG ───────────────────────────────────────────────────────────
COM_PORT   = "COM13"      # Adjust if your Arduino uses another port
BAUD_RATE  = 9600
DB_PARAMS  = dict(
    dbname="temp_monitor",
    user="postgres",
    password="11111111",
    host="localhost",
    port="5432"
)
BATCH_SIZE = 10           # Number of readings to insert at once
# ─────────────────────────────────────────────────────────────────────

def main():
    print(f"Opening {COM_PORT} at {BAUD_RATE} bps...")
    ser = serial.Serial(COM_PORT, BAUD_RATE, timeout=1)
    time.sleep(2)  # Allow Arduino to reset

    conn = psycopg2.connect(**DB_PARAMS)
    cur  = conn.cursor()

    buffer = []  # For batch insert
    print("Logging started. Press Ctrl+C to stop.\n")

    try:
        while True:
            if ser.in_waiting:
                line = ser.readline().decode("utf-8").strip()
                try:
                    temp = float(line)
                    if temp >= 20:
                        buffer.append((datetime.now(), temp))
                        print(f"Logged: {temp:.2f} °C")
                    else:
                        print(f"Ignored (<20 °C): {temp:.2f}")
                except ValueError:
                    print("Non-numeric data:", line)

            if len(buffer) >= BATCH_SIZE:
                execute_values(
                    cur,
                    "INSERT INTO temperature_log (timestamp, temperature_c) VALUES %s",
                    buffer
                )
                conn.commit()
                buffer.clear()

    except KeyboardInterrupt:
        print("\nStopped by user.")

    finally:
        if buffer:
            execute_values(
                cur,
                "INSERT INTO temperature_log (timestamp, temperature_c) VALUES %s",
                buffer
            )
            conn.commit()

        ser.close()
        cur.close()
        conn.close()
        print("Serial and database connections closed.")

if __name__ == "__main__":
    main()
