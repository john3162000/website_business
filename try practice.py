'''
dash_batch_monitor.py
Run with: python dash_batch_monitor.py
Then open http://localhost:8050 in your browser
'''

import threading
import time
from datetime import datetime

import psycopg2
import pandas as pd
from sqlalchemy import create_engine
import serial
import dash
from dash import Dash, dcc, html, callback_context
from dash.dependencies import Input, Output, State
import plotly.graph_objs as go
import dash_bootstrap_components as dbc

# ── DB CONFIG ───────────────────────────────────────────────────────
DB = dict(
    dbname='temp_trial',
    user='postgres',
    password='11111111',
    host='localhost',
    port='5432',
)

def get_conn():
    return psycopg2.connect(**DB)

engine = create_engine('postgresql://postgres:11111111@localhost:5432/temp_trial')

# ── Ensure tables exist (run once) ──────────────────────────────────
with get_conn() as con, con.cursor() as cur:
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS carbonization_batch (
            id SERIAL PRIMARY KEY,
            material_name TEXT NOT NULL,
            start_time TIMESTAMP NOT NULL,
            end_time TIMESTAMP
        );
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS temperature_log (
            id SERIAL PRIMARY KEY,
            timestamp TIMESTAMP DEFAULT NOW(),
            temperature_c FLOAT,
            batch_id INTEGER REFERENCES carbonization_batch(id)
        );
        '''
    )
    con.commit()

# ── Serial Thread (Arduino → DB) ─────────────────────────────────────
SERIAL_PORT = 'COM13'
BAUD_RATE = 9600

# Global serial instance + lock so we never open twice
serial_lock = threading.Lock()
serial_instance: serial.Serial | None = None

def open_serial():
    global serial_instance
    while True:
        with serial_lock:
            try:
                if serial_instance is None or not serial_instance.is_open:
                    serial_instance = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
                    print(f'[INFO] Serial connected: {SERIAL_PORT} @ {BAUD_RATE}')
                    time.sleep(2)
                    serial_instance.reset_input_buffer()
                return serial_instance
            except serial.SerialException as e:
                print(f'[ERROR] Cannot open {SERIAL_PORT}: {e}. Retrying in 5 seconds...')
        time.sleep(5)

def serial_worker():
    global serial_instance
    ser = open_serial()
    while True:
        try:
            with serial_lock:
                raw = ser.readline().decode('utf-8', errors='ignore').strip()
            if raw == '':
                continue
            print(f'[Serial Raw] {raw}')
            try:
                temp = float(raw)
            except ValueError:
                print(f'[Parse Error] "{raw}" is not numeric; skipping')
                continue
            print(f'[Parsed Temp] {temp}°C')
            try:
                with get_conn() as con, con.cursor() as cur:
                    cur.execute('INSERT INTO temperature_log (temperature_c) VALUES (%s)', (temp,))
                    con.commit()
                print('[INFO] Temp written to DB')
            except Exception as db_err:
                print(f'[ERROR] DB insert failed: {db_err}')
        except serial.SerialException as ser_err:
            print(f'[ERROR] Serial connection lost: {ser_err}. Re-establishing...')
            with serial_lock:
                try:
                    if serial_instance:
                        serial_instance.close()
                except Exception:
                    pass
                serial_instance = None
            time.sleep(3)
            ser = open_serial()
        except Exception as err:
            print(f'[ERROR] Unexpected serial loop error: {err}')

threading.Thread(target=serial_worker, daemon=True).start()

# ── Dash App ────────────────────────────────────────────────────────
app = Dash(__name__, external_stylesheets=[dbc.themes.BOOTSTRAP])
app.title = 'Carbonization Batch Monitor'

app.layout = dbc.Container([
    html.H3('Carbonization Batch Control'),
    dbc.Row([
        dbc.Col(dbc.Input(id='material-input', placeholder='Enter material (e.g., coconut husk)', type='text'), width=6),
        dbc.Col(dbc.Button('Start Batch', id='start-btn', color='success', className='me-2'), width='auto'),
        dbc.Col(dbc.Button('Stop Batch', id='stop-btn', color='danger', disabled=True), width='auto'),
    ], className='g-2'),
    html.Hr(),
    dcc.Graph(id='temp-graph'),
    dcc.Interval(id='update-intv', interval=3000, n_intervals=0),
    dcc.Store(id='current-batch-id'),
    dcc.Store(id='current-start-time'),
], fluid=True)

# ── Callbacks ───────────────────────────────────────────────────────
@app.callback(
    Output('current-batch-id', 'data'),
    Output('current-start-time', 'data'),
    Output('stop-btn', 'disabled'),
    Output('start-btn', 'disabled'),
    Input('start-btn', 'n_clicks'),
    Input('stop-btn', 'n_clicks'),
    State('material-input', 'value'),
    State('current-batch-id', 'data'),
    State('current-start-time', 'data'),
    prevent_initial_call=True,
)
def handle_batch(start_clicks, stop_clicks, material, batch_id, start_iso):
    ctx = callback_context
    if not ctx.triggered:
        raise dash.exceptions.PreventUpdate
    button_id = ctx.triggered[0]['prop_id'].split('.')[0]

    if button_id == 'start-btn':
        if not material:
            raise dash.exceptions.PreventUpdate
        now = datetime.now()
        with get_conn() as con, con.cursor() as cur:
            cur.execute('INSERT INTO carbonization_batch (material_name, start_time) VALUES (%s, %s) RETURNING id', (material, now))
            new_batch_id = cur.fetchone()[0]
            con.commit()
        return new_batch_id, now.isoformat(), False, True

    if button_id == 'stop-btn':
        if not batch_id:
            raise dash.exceptions.PreventUpdate
        end = datetime.now()
        with get_conn() as con, con.cursor() as cur:
            cur.execute('UPDATE carbonization_batch SET end_time=%s WHERE id=%s', (end, batch_id))
            cur.execute('UPDATE temperature_log SET batch_id=%s WHERE timestamp BETWEEN %s AND %s', (batch_id, datetime.fromisoformat(start_iso), end))
            con.commit()
        return None, None, True, False

    raise dash.exceptions.PreventUpdate


@app.callback(
    Output('temp-graph', 'figure'),
    Input('update-intv', 'n_intervals'),
)
def update_graph(_):
    df = pd.read_sql('SELECT timestamp, temperature_c FROM temperature_log WHERE temperature_c >= 20 ORDER BY timestamp DESC LIMIT 100', engine)
    if df.empty:
        return go.Figure()
    df = df.sort_values('timestamp')
    fig = go.Figure(go.Scatter(x=df['timestamp'], y=df['temperature_c'], mode='lines+markers'))
    fig.update_layout(title='Latest Temperature (≥20 °C)', xaxis_title='Timestamp', yaxis_title='Temperature (°C)', margin=dict(l=40, r=20, t=40, b=40))
    return fig

if __name__ == '__main__':
    app.run(debug=True)
