"""
app.py - Flask backend for Messenger CRM
Receives inbound lead notifications from the Chrome extension
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)

LOG_FILE = 'leads_log.json'


def load_log():
    if not os.path.exists(LOG_FILE):
        return []
    with open(LOG_FILE, 'r') as f:
        try:
            return json.load(f)
        except:
            return []


def save_log(data):
    with open(LOG_FILE, 'w') as f:
        json.dump(data, f, indent=2)


@app.route('/inbound', methods=['POST'])
def inbound():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'no data'}), 400

    entry = {
        'timestamp': datetime.now().isoformat(),
        'name': data.get('name', ''),
        'threadId': data.get('threadId', ''),
        'lastMsg': data.get('lastMsg', ''),
        'msgTimestamp': data.get('timestamp', ''),
        'seenBy': data.get('seenBy', ''),
    }

    # Log to console
    print(f"\n🔔 INBOUND: {entry['name']}")
    print(f"   Message: {entry['lastMsg'][:80]}")
    print(f"   Thread: https://facebook.com/messages/t/{entry['threadId']}")
    print(f"   Time: {entry['msgTimestamp']}")

    # Append to log file
    log = load_log()
    log.append(entry)
    save_log(log)

    return jsonify({'status': 'ok'})


@app.route('/leads', methods=['GET'])
def get_leads():
    """Return all logged inbound leads"""
    return jsonify(load_log())


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'running', 'time': datetime.now().isoformat()})


if __name__ == '__main__':
    print("Messenger CRM backend running on http://localhost:5000")
    app.run(host='localhost', port=5000, debug=True)
