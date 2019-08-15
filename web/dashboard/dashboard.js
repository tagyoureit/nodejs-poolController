(function ($) {
    $.widget("pic.dashboard", {
        options: { socket: null },
        _create: function () {
            var self = this, o = self.options, el = self.element;
            console.log('Creating dashboard');
            self._initState();
        },
        _createControllerPanel: function (data) {
            var self = this, o = self.options, el = self.element;
            el.find('div.picController').each(function () {
                this.initController(data);
            });
        },
        _createBodiesPanel: function (data) {
            var self = this, o = self.options, el = self.element;
            el.find('div.picBodies').each(function () {
                this.initBodies(data);
            });
        },
        _createCircuitsPanel: function (data) {
            var self = this, o = self.options, el = self.element;
            el.find('div.picCircuits').each(function () {
                this.initCircuits(data);
            });
        },
        _createPumpsPanel: function (data) {
            var self = this, o = self.options, el = self.element;
            el.find('div.picPumps').each(function () {
                this.initPumps(data);
            });
        },
        _createChemistryPanel: function (data) {
            var self = this, o = self.options, el = self.element;
            el.find('div.picChemistry').each(function () {
                this.initChemistry(data);
            });
        },

        _initState: function () {
            var self = this, o = self.options, el = self.element;
            $.getJSON('/state/all', null, function (data, status, xhr) {
                self._createControllerPanel(data);
                self._createCircuitsPanel(data);
                self._createPumpsPanel(data);
                self._createBodiesPanel(data);
                self._createChemistryPanel(data);
                self._initSockets();
                console.log(data);

            })
                .done(function (status, xhr) { console.log('Done:' + status); })
                .fail(function (xhr, status, error) { console.log('Failed:' + error); });
               
        },
        _initSockets: function () {
            var self = this, o = self.options, el = self.element;
            o.socket = io({ reconnectionDelay: 2000, reconnection: true, reconnectionDelayMax: 20000 });
            o.socket.on('circuit', function (data) {
                console.log({ evt: 'circuit', data: data });
                $('div.picCircuit[data-circuitid=' + data.id + ']').each(function () {
                    this.setState(data);
                });
                $('div.picBody[data-circuitid=' + data.id + ']').each(function () {
                    console.log(this);
                    this.setCircuitState(data);
                });
            });
            o.socket.on('feature', function (data) {
                console.log({ evt: 'feature', data: data });
                $('div.picCircuit[data-featureid=' + data.id + ']').each(function () {
                    this.setState(data);
                });
            });
            o.socket.on('temps', function (data) {
                console.log({ evt: 'temps', data: data });
                $('div.picBodies').each(function () {
                    this.setTemps(data);
                });
            });
            o.socket.on('chlorinator', function (data) {
                console.log({ evt: 'chlorinator', data: data });
                $('div.picChlorinator[data-id=' + data.id + ']').each(function () {
                    this.setEquipmentData(data);
                });
            });
            o.socket.on('body', function (data) {
                console.log({ evt: 'body', data: data });
            });
            o.socket.on('schedule', function (data) {
                console.log({ evt: 'schedule', data: data });
            });
            o.socket.on('delay', function (data) {
                console.log({ evt: 'delay', data: data });
            });
            o.socket.on('equipment', function (data) {
                console.log({ evt: 'equipment', data: data });
                $('div.picController').each(function () {
                    this.setEqipmentState(data);
                });
            });

            o.socket.on('controller', function (data) {
                console.log({ evt: 'controller', data: data });
                $('div.picController').each(function () {
                    this.setControllerState(data);
                });
            });
            o.socket.on('pump', function (data) {
                console.log({ evt: 'pump', data: data });
                $('div.picPumpContainer').each(function () {
                    this.setPumpData(data);
                });
            });
            o.socket.on('pumpExt', function (data) {
                console.log({ evt: 'pumpExt', data: data });
                $('div.picPumpContainer').each(function () {
                    this.setPumpData(data);
                });
            });

            o.socket.on('heater', function (data) {
                console.log({ evt: 'heater', data: data });
            });
            o.socket.on('connect_error', function (data) {
                console.log('connection error:' + data);
                $('div.picController').each(function () {
                    this.setConnectionError({ status: { val: 255, name: 'error', desc: 'Connection Error' } });
                });
                el.find('div.picControlPanel').each(function () {
                    $(this).addClass('picDisconnected');
                });

            });
            o.socket.on('connect_timeout', function (data) {
                console.log('connection timeout:' + data);
            });

            o.socket.on('reconnect', function (data) {
                console.log('reconnect:' + data);
            });
            o.socket.on('reconnect_attempt', function (data) {
                console.log('reconnect attempt:' + data);
            });
            o.socket.on('reconnecting', function (data) {
                console.log('reconnecting:' + data);
            });
            o.socket.on('reconnect_failed', function (data) {
                console.log('reconnect failed:' + data);
            });
            o.socket.on('connect', function (sock) {
                console.log({ msg: 'socket connected:', sock: sock });
                el.find('div.picControlPanel').each(function () {
                    $(this).removeClass('picDisconnected');
                });

            });
            o.socket.on('close', function (sock) {
                console.log({ msg: 'socket closed:', sock: sock });
            });
           
        }
    }
    );
})(jQuery);
