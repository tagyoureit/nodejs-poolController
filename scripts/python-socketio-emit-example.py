# this sample uses the socketIO-client client library.
# pip install socketIO-client

from socketIO_client import SocketIO, BaseNamespace
import json
import time

socketIO = SocketIO('localhost', 3000, BaseNamespace)
rpm = raw_input("Please enter RPM for Pump 1:")
socketIO.emit('setPumpCommand', 'run', 1, rpm)

def on_connect(self):
    print('[Connected]')

def on_reconnect(self):
    print('[Reconnected]')

def on_disconnect(self):
   print('[Disconnected]')

def on_pump(self):
    print('[Pump] {0}'.format(json.dumps(self['1'], indent=2)))

time.sleep(1)
socketIO.once('pump', on_pump)
socketIO.wait(seconds=1)
