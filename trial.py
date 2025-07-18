"""
Dash Batch Monitor
────────────────────────────────────────────────────────────
Features
• Login screen with eco_friendly.png background
• Header bar with karbon_logo.png + “KARBON CORP”
• Start / Stop batches with extra metadata (size-cut, moisture, description)
• Background thread simulates temperature every 2 s while a batch is open
• Live temperature graph
• Batch history table, per-batch graph, CSV download, delete
────────────────────────────────────────────────────────────
Folder structure
Website business/
├─ dash_batch_monitor.py    ← this file
└─ assets/
   ├─ karbon_logo.png
   └─ eco_friendly.png
"""

# ── Imports ──────────────────────────────────────────────────────────
import threading, time, random, psycopg2, pandas as pd
from datetime import datetime
import dash
from dash import Dash, dcc, html, dash_table, callback_context, no_update
from dash import Input, Output, State
import plotly.graph_objs as go
import dash_bootstrap_components as dbc

# ── Demo credentials ────────────────────────────────────────────────
VALID_USER = "admin"
VALID_PASS = "password"

# ── Database config ─────────────────────────────────────────────────
DB = dict(
    dbname="temp_monitor",
    user="postgres",
    password="11111111",
    host="localhost",
    port="5432"
)
get_conn = lambda: psycopg2.connect(**DB)

# Ensure tables exist
with get_conn() as con, con.cursor() as cur:
    cur.execute("""
        CREATE TABLE IF NOT EXISTS carbonization_batch (
            id SERIAL PRIMARY KEY,
            material_name TEXT NOT NULL,
            size_cut TEXT,
            moisture_condition INTEGER,
            description TEXT,
            start_time TIMESTAMP NOT NULL,
            end_time TIMESTAMP
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS temperature_log (
            id SERIAL PRIMARY KEY,
            timestamp TIMESTAMP DEFAULT NOW(),
            temperature_c FLOAT,
            batch_id INTEGER REFERENCES carbonization_batch(id)
        );
    """)
    con.commit()

# ── Dash App ─────────────────────────────────────────────────────────
app = Dash(
    __name__,
    external_stylesheets=[dbc.themes.BOOTSTRAP],
    suppress_callback_exceptions=True,
)
app.title = "Carbonization Monitor"

app.layout = html.Div([
    dcc.Location(id="url"),
    dcc.Store(id="auth", storage_type="session"),
    html.Div(id="page"),
])

# ── Layout builders ────────────────────────────────────────────────
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
                    dbc.CardHeader(html.H4("Login to Karbon Corp")),
                    dbc.CardBody([
                        dbc.Input(id="username", placeholder="Username", className="mb-2"),
                        dbc.Input(id="password", placeholder="Password", type="password", className="mb-2"),
                        dbc.Button("Login", id="login-btn", color="primary", className="w-100"),
                        html.Div(id="login-msg", className="text-danger mt-2"),
                    ]),
                ],
                style={"width": "300px"},
            )
        ],
    )

def main_layout():
    header = dbc.Navbar(
        dbc.Container([
            html.Img(src="/assets/karbon_logo.png", height="40px"),
            html.H2("KARBON CORP", className="ms-3 mb-0 text-white"),
        ], fluid=True),
        color="dark", dark=True, className="mb-4",
    )

    live_tab = dcc.Tab(label="Live Monitor", value="live", children=[
        html.Br(),
        dbc.Row([
            dbc.Col(dbc.Input(id="material", placeholder="Material name"), width=3),
            dbc.Col(dbc.Input(id="size", placeholder="Size cut"), width=2),
            dbc.Col(dbc.Input(id="moisture", type="number", min=1, max=10, placeholder="Moisture 1-10"), width=2),
            dbc.Col(dbc.Input(id="desc", placeholder="Description"), width=3),
            dbc.Col(dbc.Button("Start Batch", id="start", color="success"), width="auto"),
            dbc.Col(dbc.Button("Stop Batch", id="stop", color="danger", disabled=True), width="auto"),
        ], className="g-2"),
        html.Hr(),
        dcc.Graph(id="live-graph"),
        dcc.Interval(id="live-int", interval=3_000, n_intervals=0),
    ])

    history_tab = dcc.Tab(label="Batch History", value="hist", children=[
        html.Br(),
        dash_table.DataTable(
            id="table", row_selectable="single", page_size=10,
            style_table={"overflowX": "auto"},
            style_cell={"textAlign": "left"},
            columns=[
                {"name": "ID", "id": "id"},
                {"name": "Material", "id": "material_name"},
                {"name": "Size", "id": "size_cut"},
                {"name": "Moisture", "id": "moisture_condition"},
                {"name": "Start", "id": "start_time"},
                {"name": "End", "id": "end_time"},
            ],
        ),
        dcc.Interval(id="hist-int", interval=3_000, n_intervals=0),
        html.Br(),
        dbc.Button("Download CSV", id="dl", color="primary", className="me-2", disabled=True),
        dbc.Button("Delete Batch", id="del", color="danger", disabled=True),
        dcc.Download(id="csv"),
        html.Hr(),
        dcc.Graph(id="hist-graph"),
        dash_table.DataTable(id="temps", page_size=15, style_table={"overflowX": "auto"}, style_cell={"textAlign": "left"}),
    ])

    return dbc.Container([
        header,
        dcc.Tabs(id="tabs", value="live", children=[live_tab, history_tab]),
        dcc.Store(id="batch"),
    ], fluid=True)

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

@app.callback(
    Output("batch", "data"),
    Output("stop", "disabled"),
    Output("start", "disabled"),
    Input("start", "n_clicks"),
    Input("stop", "n_clicks"),
    State("material", "value"),
    State("size", "value"),
    State("moisture", "value"),
    State("desc", "value"),
    State("batch", "data"),
    prevent_initial_call=True,
)
def control_batch(start, stop, mat, size, moist, desc, bid):
    ctx = callback_context
    if not ctx.triggered:
        raise dash.exceptions.PreventUpdate
    btn = ctx.triggered[0]["prop_id"].split(".")[0]

    with get_conn() as con, con.cursor() as cur:
        if btn == "start":
            if not all([mat, size, moist, desc]):
                raise dash.exceptions.PreventUpdate
            cur.execute(
                """
                INSERT INTO carbonization_batch (material_name, size_cut, moisture_condition, description, start_time)
                VALUES (%s, %s, %s, %s, NOW()) RETURNING id;
                """,
                (mat, size, moist, desc),
            )
            new_id = cur.fetchone()[0]
            con.commit()
            return new_id, False, True
        else:
            cur.execute("UPDATE carbonization_batch SET end_time = NOW() WHERE id = %s", (bid,))
            cur.execute("UPDATE temperature_log SET batch_id = %s WHERE batch_id IS NULL", (bid,))
            con.commit()
            return no_update, True, False

@app.callback(Output("live-graph", "figure"), Input("live-int", "n_intervals"), State("batch", "data"))
def live_graph(_, bid):
    if bid:
        query = """
            SELECT timestamp, temperature_c FROM temperature_log
            WHERE batch_id = %s AND temperature_c BETWEEN 10 AND 60
            ORDER BY timestamp DESC LIMIT 100
        """
        params = (bid,)
    else:
        query = """
            SELECT timestamp, temperature_c FROM temperature_log
            WHERE temperature_c BETWEEN 10 AND 60
            ORDER BY timestamp DESC LIMIT 100
        """
        params = None

    with get_conn() as con:
        df = pd.read_sql(query, con, params=params)

    if df.empty:
        return go.Figure()

    df = df.sort_values("timestamp")
    fig = go.Figure(go.Scatter(x=df["timestamp"], y=df["temperature_c"], mode="lines+markers"))
    fig.update_layout(
        xaxis_title="Timestamp",
        yaxis_title="Temperature (°C)",
        margin=dict(l=20, r=20, t=40, b=40),
        title="Live Temperature Monitoring",
        yaxis=dict(tickformat=".1f"),
    )
    return fig

@app.callback(Output("table", "data"), Input("hist-int", "n_intervals"))
def refresh_table(_):
    with get_conn() as con:
        df = pd.read_sql(
            """
            SELECT id, material_name, size_cut, moisture_condition, start_time, end_time
            FROM carbonization_batch
            ORDER BY id DESC
            LIMIT 100
            """,
            con,
        )
    return df.to_dict("records")

@app.callback(
    Output("dl", "disabled"),
    Output("del", "disabled"),
    Input("table", "selected_rows"),
)
def toggle_buttons(rows):
    disabled = not bool(rows)
    return disabled, disabled

@app.callback(
    Output("hist-graph", "figure"),
    Output("temps", "data"),
    Input("table", "selected_rows"),
    State("table", "data"),
)
def batch_details(rows, data):
    if not rows:
        return go.Figure(), []
    bid = data[rows[0]]["id"]
    with get_conn() as con:
        df = pd.read_sql(
            "SELECT timestamp, temperature_c FROM temperature_log WHERE batch_id = %s ORDER BY timestamp",
            con,
            params=(bid,),
        )
    fig = go.Figure(go.Scatter(x=df.timestamp, y=df.temperature_c, mode="lines+markers"))
    fig.update_layout(title=f"Batch {bid} Temperature")
    return fig, df.to_dict("records")

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
    with get_conn() as con:
        df = pd.read_sql(
            "SELECT * FROM temperature_log WHERE batch_id = %s ORDER BY timestamp",
            con,
            params=(bid,),
        )
    return dcc.send_data_frame(df.to_csv, f"batch_{bid}_temperature.csv", index=False)

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
    with get_conn() as con, con.cursor() as cur:
        cur.execute("DELETE FROM temperature_log WHERE batch_id = %s", (bid,))
        cur.execute("DELETE FROM carbonization_batch WHERE id = %s", (bid,))
        con.commit()
    return []

if __name__ == "__main__":
    app.run(debug=True)
