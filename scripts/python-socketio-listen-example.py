# this sample uses the socketIO-client client library.
# pip install socketIO-client

from socketIO_client import SocketIO, BaseNamespace
import json

def on_connect(self):
    print('[Connected]')

def on_reconnect(self):
    print('[Reconnected]')

def on_disconnect(self):
   print('[Disconnected]')

def on_pump(self):

    print('[Pump] {0}'.format(json.dumps(self['1'], indent=2)))

socketIO = SocketIO('localhost', 3000, BaseNamespace)
socketIO.on('pump', on_pump)
socketIO.wait()
