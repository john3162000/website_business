import threading, time, psycopg2, pandas as pd
from datetime import datetime
import dash
from dash import Dash, dcc, html, dash_table, callback_context, no_update
from dash import Input, Output, State
import plotly.graph_objs as go
import dash_bootstrap_components as dbc
import requests
import re
from flask import request, jsonify

# ── Configuration ──────────────────────────────────────
ESP32_URL = "http://192.168.101.84"  # Update this if IP changes

# ── Shared state ──────────────────────────────────────
current_batch_id = None
batch_recording = False  # Flag to control recording
serial_lock = threading.Lock()

# ── Demo credentials ─────────────────────────────────
VALID_USER = "admin"
VALID_PASS = "password"

# ── Database config ──────────────────────────────────
def get_conn():
    return psycopg2.connect(
        dbname="postgres",
        user="postgres.vdpptixwogcrbcipselj",  # notice the dot in the user!
        password="J@0602ian0827",
        host="aws-0-ap-southeast-1.pooler.supabase.com",  # this is the pooler host
        port="5432",
        sslmode="require"
    )

# ── Initialize Database Tables ─────────────────────────
def init_database():
    try:
        with get_conn() as con, con.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS carbonization_batch (
                    id SERIAL PRIMARY KEY,
                    material_name TEXT NOT NULL,
                    size_cut TEXT,
                    moisture_condition INTEGER,
                    description TEXT,
                    start_time TIMESTAMP NOT NULL,
                    end_time   TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS temperature_log (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMP DEFAULT NOW(),
                    temperature_c FLOAT,
                    batch_id INTEGER REFERENCES carbonization_batch(id)
                );
                """
            )
            con.commit()
            print("[INFO] Database tables initialized successfully")
    except Exception as e:
        print(f"[ERROR] Failed to initialize database: {e}")

# ── Temperature Reading Function ─────────────────────────
def read_temperature():
    try:
        response = requests.get(ESP32_URL, timeout=2)
        response.raise_for_status()
        text = response.text.strip()

        # Try to extract from "Temperature: 30.75 °C"
        match = re.search(r'Temperature:\s*([0-9.]+)', text)
        if match:
            return float(match.group(1))

        # Try to extract direct float like "30.75"
        elif re.fullmatch(r"[0-9.]+", text):
            return float(text)

        else:
            print(f"[WARNING] Could not extract temperature from: {text}")
            return None

    except Exception as e:
        print(f"[WARNING] Failed to read from ESP32: {e}")
        return None

# ── Background Temperature Monitoring Thread ─────────────
def temperature_monitor():
    """Background thread that continuously monitors temperature when batch is active"""
    global current_batch_id, batch_recording
    
    while True:
        try:
            if batch_recording and current_batch_id:
                temp_c = read_temperature()
                
                if temp_c is not None:
                    with get_conn() as con, con.cursor() as cur:
                        cur.execute(
                            "INSERT INTO temperature_log (temperature_c, batch_id) VALUES (%s, %s)",
                            (temp_c, current_batch_id),
                        )
                        con.commit()
                        print(f"[MONITOR] Logged: {temp_c:.2f}°C for batch {current_batch_id}")
                
            time.sleep(5)  # Read temperature every 5 seconds when recording
        except Exception as e:
            print(f"[ERROR] Temperature monitor error: {e}")
            time.sleep(10)  # Wait longer on error

# Start the background monitoring thread
monitoring_thread = threading.Thread(target=temperature_monitor, daemon=True)
monitoring_thread.start()

# ── Dash app init ────────────────────────────────────────
app = Dash(
    __name__,
    external_stylesheets=[dbc.themes.BOOTSTRAP],
    suppress_callback_exceptions=True,
)
app.title = "Carbonization Monitor"

app.layout = html.Div(
    [
        dcc.Location(id="url"),
        dcc.Store(id="auth", storage_type="session"),
        html.Div(id="page"),
    ]
)

# ── Layout builders ─────────────────────────────────────
def login_layout():
    return html.Div(
        style={
            "background": "url('/assets/eco_friendly.jpg') center/cover no-repeat",
            "height": "100vh",
            "display": "flex",
            "justifyContent": "center",
            "alignItems": "center",
        },
        children=[
            dbc.Card(
                [
                    dbc.CardHeader(html.H4("Login to Karbon Corp", className="text-center")),
                    dbc.CardBody(
                        [
                            dbc.Input(id="username", placeholder="Username", className="mb-3"),
                            dbc.Input(id="password", placeholder="Password", type="password", className="mb-3"),
                            dbc.Button("Login", id="login-btn", color="primary", className="w-100"),
                            html.Div(id="login-msg", className="text-danger mt-2"),
                        ]
                    ),
                ],
                style={"width": "350px", "boxShadow": "0 4px 6px rgba(0, 0, 0, 0.1)", "backgroundColor": "rgba(255,255,255,0.95)"},
            )
        ],
    )

def main_layout():
    header = dbc.Navbar(
        dbc.Container(
            [
                html.Img(src="/assets/karbon_logo.png", height="40px", className="me-3"),
                html.H2("KARBON CORP - Carbonization Monitor", className="mb-0 text-white"),
            ],
            fluid=True,
        ),
        color="dark",
        dark=True,
        className="mb-4",
    )

    live_tab = dcc.Tab(
        label="Live Monitor",
        value="live",
        children=[
            html.Br(),
            dbc.Alert(
                id="batch-status",
                children="No active batch",
                color="secondary",
                className="mb-3"
            ),
            dbc.Row(
                [
                    dbc.Col(dbc.Input(id="material", placeholder="Material name"), width=3),
                    dbc.Col(dbc.Input(id="size", placeholder="Size cut"), width=2),
                    dbc.Col(dbc.Input(id="moisture", type="number", min=1, max=10, placeholder="Moisture 1-10"), width=2),
                    dbc.Col(dbc.Input(id="desc", placeholder="Description"), width=3),
                    dbc.Col(dbc.Button("Start Batch", id="start", color="success"), width="auto"),
                    dbc.Col(dbc.Button("Stop Batch", id="stop", color="danger", disabled=True), width="auto"),
                ],
                className="g-2",
            ),
            html.Hr(),
            dcc.Graph(id="live-graph"),
            dcc.Interval(id="live-int", interval=3_000, n_intervals=0),  # Update graph every 3 seconds
        ],
    )

    history_tab = dcc.Tab(
        label="Batch History",
        value="hist",
        children=[
            html.Br(),
            dash_table.DataTable(
                id="table",
                row_selectable="single",
                page_size=10,
                style_table={"overflowX": "auto"},
                style_cell={"textAlign": "left"},
                columns=[
                    {"name": "ID", "id": "id"},
                    {"name": "Material", "id": "material_name"},
                    {"name": "Size", "id": "size_cut"},
                    {"name": "Moisture", "id": "moisture_condition"},
                    {"name": "Description", "id": "description"},
                    {"name": "Start", "id": "start_time"},
                    {"name": "End", "id": "end_time"},
                ],
            ),
            dcc.Interval(id="hist-int", interval=10_000, n_intervals=0),
            html.Br(),
            dbc.Button("Download CSV", id="dl", color="primary", className="me-2", disabled=True),
            dbc.Button("Delete Batch", id="del", color="danger", disabled=True),
            dcc.Download(id="csv"),
            html.Hr(),
            dcc.Graph(id="hist-graph"),
            dash_table.DataTable(
                id="temps", 
                page_size=15, 
                style_table={"overflowX": "auto"}, 
                style_cell={"textAlign": "left"},
                columns=[
                    {"name": "ID", "id": "id"},
                    {"name": "Timestamp", "id": "timestamp"},
                    {"name": "Temperature (°C)", "id": "temperature_c"},
                ]
            ),
        ],
    )

    return dbc.Container(
        [
            header,
            dcc.Tabs(id="tabs", value="live", children=[live_tab, history_tab]),
            dcc.Store(id="batch"),  # holds current batch ID
        ],
        fluid=True,
    )

# ── Authentication callbacks ───────────────────────────
@app.callback(
    Output("auth", "data"),
    Output("login-msg", "children"),
    Input("login-btn", "n_clicks"),
    State("username", "value"),
    State("password", "value"),
    prevent_initial_call=True,
)
def login(_, user, pwd):
    if user == VALID_USER and pwd == VALID_PASS:
        return True, ""
    return dash.no_update, "Invalid credentials"

@app.callback(Output("page", "children"), Input("auth", "data"))
def display_page(auth):
    return main_layout() if auth else login_layout()

# ── Batch control (Start / Stop) ───────────────────────
@app.callback(
    [Output("batch", "data"),
     Output("stop", "disabled"),
     Output("start", "disabled"),
     Output("batch-status", "children"),
     Output("batch-status", "color"),
     Output("material", "value"),
     Output("size", "value"),
     Output("moisture", "value"),
     Output("desc", "value")],
    [Input("start", "n_clicks"),
     Input("stop", "n_clicks")],
    [State("material", "value"),
     State("size", "value"),
     State("moisture", "value"),
     State("desc", "value"),
     State("batch", "data")],
    prevent_initial_call=True,
)
def control_batch(start, stop, mat, size, moist, desc, bid):
    global current_batch_id, batch_recording
    ctx = callback_context
    if not ctx.triggered:
        raise dash.exceptions.PreventUpdate
    btn = ctx.triggered[0]["prop_id"].split(".")[0]

    try:
        with get_conn() as con, con.cursor() as cur:
            if btn == "start":
                if not all([mat, size, moist, desc]):
                    raise dash.exceptions.PreventUpdate
                    
                cur.execute(
                    """
                    INSERT INTO carbonization_batch
                    (material_name, size_cut, moisture_condition, description, start_time)
                    VALUES (%s, %s, %s, %s, NOW())
                    RETURNING id;
                    """,
                    (mat, size, moist, desc),
                )
                new_id = cur.fetchone()[0]
                con.commit()
                
                with serial_lock:
                    current_batch_id = new_id
                    batch_recording = True
                    
                print(f"[INFO] Started batch {new_id} - Recording temperature data")
                return (new_id, False, True, 
                        f"🟢 Recording Batch #{new_id} - {mat}", "success",
                        "", "", None, "")  # Clear input fields
                        
            else:  # stop
                if bid:
                    cur.execute("UPDATE carbonization_batch SET end_time = NOW() WHERE id = %s", (bid,))
                    con.commit()
                    
                    with serial_lock:
                        current_batch_id = None
                        batch_recording = False
                        
                    print(f"[INFO] Stopped batch {bid} - Temperature recording stopped")
                    return (no_update, True, False, 
                            f"🔴 Stopped Batch #{bid}", "warning",
                            no_update, no_update, no_update, no_update)
                            
    except Exception as e:
        print(f"[ERROR] Batch control failed: {e}")
        raise dash.exceptions.PreventUpdate

# ── Live graph update ─────────────────────────────────
@app.callback(Output("live-graph", "figure"), Input("live-int", "n_intervals"), State("batch", "data"))
def live_graph(_, bid):
    try:
        if bid:
            query = """
                SELECT timestamp, temperature_c FROM temperature_log
                WHERE batch_id = %s
                ORDER BY timestamp DESC LIMIT 100
            """
            params = (bid,)
            title = f"Live Temperature Monitoring - Batch #{bid}"
        else:
            query = """
                SELECT timestamp, temperature_c FROM temperature_log
                ORDER BY timestamp DESC LIMIT 100
            """
            params = None
            title = "Live Temperature Monitoring - No Active Batch"

        with get_conn() as con:
            df = pd.read_sql(query, con, params=params)

        if df.empty:
            return go.Figure().update_layout(
                title=title,
                xaxis_title="Timestamp",
                yaxis_title="Temperature (°C)",
                template="plotly_white"
            )

        df = df.sort_values("timestamp")
        
        # Create the line chart
        fig = go.Figure()
        
        fig.add_trace(go.Scatter(
            x=df["timestamp"],
            y=df["temperature_c"],
            mode="lines+markers",
            name="Temperature",
            line=dict(color="#1f77b4", width=2),
            marker=dict(size=4)
        ))
        
        fig.update_layout(
            title=title,
            xaxis_title="Timestamp",
            yaxis_title="Temperature (°C)",
            template="plotly_white",
            hovermode="x unified"
        )
        
        return fig
        
    except Exception as e:
        print(f"[ERROR] Graph query failed: {e}")
        return go.Figure().update_layout(
            title="Database Error",
            xaxis_title="Timestamp",
            yaxis_title="Temperature (°C)",
            template="plotly_white"
        )

# ── Refresh history table ─────────────────────────────
@app.callback(Output("table", "data"), Input("hist-int", "n_intervals"))
def refresh_table(_):
    try:
        with get_conn() as con:
            df = pd.read_sql(
                """
                SELECT id, material_name, size_cut, moisture_condition, description, 
                       TO_CHAR(start_time, 'YYYY-MM-DD HH24:MI:SS') as start_time,
                       TO_CHAR(end_time, 'YYYY-MM-DD HH24:MI:SS') as end_time
                FROM carbonization_batch
                ORDER BY id DESC
                LIMIT 100
                """,
                con,
            )
        return df.to_dict("records")
    except Exception as e:
        print(f"[ERROR] Failed to refresh table: {e}")
        return []

# ── Toggle action buttons ─────────────────────────────
@app.callback(
    [Output("dl", "disabled"),
     Output("del", "disabled")],
    [Input("table", "selected_rows")],
)
def toggle_buttons(rows):
    disabled = not bool(rows)
    return disabled, disabled

# ── Display batch details ─────────────────────────────
@app.callback(
    [Output("hist-graph", "figure"),
     Output("temps", "data")],
    [Input("table", "selected_rows")],
    [State("table", "data")],
)
def batch_details(rows, data):
    if not rows:
        return go.Figure().update_layout(title="Select a batch to view details"), []
    
    bid = data[rows[0]]["id"]
    
    try:
        with get_conn() as con:
            df = pd.read_sql(
                """SELECT id, TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI:SS') as timestamp, 
                   temperature_c FROM temperature_log 
                   WHERE batch_id = %s ORDER BY timestamp""",
                con,
                params=(bid,),
            )
    except Exception as e:
        print(f"[ERROR] Failed to load batch details: {e}")
        return go.Figure().update_layout(title="Database Error"), []
    
    if df.empty:
        return go.Figure().update_layout(title=f"No temperature data for Batch {bid}"), []
    
    # Convert timestamp back to datetime for plotting
    df['timestamp_dt'] = pd.to_datetime(df['timestamp'])
    
    fig = go.Figure(go.Scatter(
        x=df['timestamp_dt'], 
        y=df['temperature_c'], 
        mode="lines+markers",
        name="Temperature",
        line=dict(color="#1f77b4", width=2),
        marker=dict(size=4)
    ))
    fig.update_layout(
        title=f"Batch {bid} Temperature History",
        xaxis_title="Timestamp",
        yaxis_title="Temperature (°C)",
        template="plotly_white"
    )
    
    return fig, df[['id', 'timestamp', 'temperature_c']].to_dict("records")

# ── Download CSV ─────────────────────────────────────
@app.callback(
    Output("csv", "data"),
    Input("dl", "n_clicks"),
    State("table", "selected_rows"),
    State("table", "data"),
    prevent_initial_call=True,
)
def download_csv(_, rows, data):
    if not rows:
        raise dash.exceptions.PreventUpdate
    
    bid = data[rows[0]]["id"]
    
    try:
        with get_conn() as con:
            df = pd.read_sql(
                """SELECT id, timestamp, temperature_c, batch_id 
                   FROM temperature_log 
                   WHERE batch_id = %s ORDER BY timestamp""",
                con,
                params=(bid,),
            )
        return dcc.send_data_frame(df.to_csv, f"batch_{bid}_temperature.csv", index=False)
    except Exception as e:
        print(f"[ERROR] Failed to download CSV: {e}")
        raise dash.exceptions.PreventUpdate

# ── Delete batch ─────────────────────────────────────
@app.callback(
    Output("table", "selected_rows"),
    Input("del", "n_clicks"),
    State("table", "selected_rows"),
    State("table", "data"),
    prevent_initial_call=True,
)
def delete_batch(_, rows, data):
    if not rows:
        raise dash.exceptions.PreventUpdate
    
    bid = data[rows[0]]["id"]
    
    try:
        with get_conn() as con, con.cursor() as cur:
            # Delete temperature logs first (due to foreign key constraint)
            cur.execute("DELETE FROM temperature_log WHERE batch_id = %s", (bid,))
            # Then delete the batch
            cur.execute("DELETE FROM carbonization_batch WHERE id = %s", (bid,))
            con.commit()
            
        global current_batch_id, batch_recording
        if current_batch_id == bid:
            with serial_lock:
                current_batch_id = None
                batch_recording = False
                
        print(f"[INFO] Deleted batch {bid}")
        return []
    except Exception as e:
        print(f"[ERROR] Failed to delete batch: {e}")
        raise dash.exceptions.PreventUpdate

# ── Flask server reference and API endpoint ──────────
server = app.server  # Reference to the Flask instance behind Dash

@server.route("/api/temp", methods=["POST"])
def receive_temp():
    """API endpoint for ESP32 to send temperature data"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
            
        temp = data.get("temperature")
        
        # If batch_id is not provided, use current active batch
        bid = data.get("batch_id") or current_batch_id

        if temp is None:
            return jsonify({"error": "Missing temperature"}), 400
            
        if not bid:
            return jsonify({"error": "No active batch"}), 400
            
        temp = float(temp)
        bid = int(bid)

        # Only record if we're actively recording for this batch
        if batch_recording and bid == current_batch_id:
            with get_conn() as con, con.cursor() as cur:
                # Verify batch ID exists
                cur.execute("SELECT 1 FROM carbonization_batch WHERE id = %s", (bid,))
                if not cur.fetchone():
                    return jsonify({"error": f"Batch ID {bid} does not exist"}), 404

                cur.execute(
                    "INSERT INTO temperature_log (temperature_c, batch_id) VALUES (%s, %s)",
                    (temp, bid)
                )
                con.commit()

            return jsonify({"status": "success", "recorded": True}), 200
        else:
            return jsonify({"status": "success", "recorded": False, "message": "Not recording"}), 200

    except Exception as e:
        print(f"[ERROR] /api/temp failed: {e}")
        return jsonify({"error": str(e)}), 500

# ── Main execution ───────────────────────────────────
if __name__ == "__main__":
    # Initialize database
    init_database()
    
    # Test database connection
    try:
        with get_conn() as con:
            with con.cursor() as cur:
                cur.execute("SELECT current_database(), current_user, NOW();")
                print("[INFO] Connected to:", cur.fetchone())
    except Exception as e:
        print(f"[ERROR] Connection failed: {e}")

    # For local development
    app.run(host="0.0.0.0", port=8050, debug=True)