(function ($) {
    $.widget("pic.bodies", {
        options: { },
        _create: function () {
            var self = this, o = self.options, el = self.element;
            el[0].initBodies = function (data) { self._initBodies(data); };
            el[0].setTemps = function (data) { self.setTemps(data); };
        },
        _initBodies: function(data) {
            var self = this, o = self.options, el = self.element;
            let div = $('<div class="picAmbientTemp"/>');
            div.appendTo(el);
            let d = $('<div><label class="picInline-label picAmbientTemp">Air Temp</label><span class="picAirTemp"/><label class="picUnitSymbol">&deg;</label><span class="picUnits">-</span></div>');
            d.appendTo(div);
            d = $('<div><label class="picInline-label picAmbientTemp">Solar Temp</label><span class="picSolarTemp"/><label class="picUnitSymbol">&deg;</label><span class="picUnits">-</span></div>');
            d.appendTo(div);
            for (let i = 0; i < data.temps.bodies.length; i++) {
                $('<div/>').appendTo(el).body(data.temps.bodies[i]);
            }
            self.setTemps(data.temps);
            for (let i = 0; i < data.circuits.length; i++) {
                let circuit = data.circuits[i];
                el.find('div.picBody[data-circuitid=' + circuit.id + ']').each(function () {
                    this.setCircuitState(circuit);
                });
            }
        },
        setTemps: function (data) {
            var self = this, o = self.options, el = self.element;
            el.find('span.picAirTemp').text(data.air);
            el.find('span.picSolarTemp').text(data.solar);
            el.find('span.picUnits').text(data.units.name);
            for (let i = 0; i < data.bodies.length; i++) {
                let body = data.bodies[i];
                el.find('div.picBody[data-id=' + body.id + ']').each(function () {
                    this.setEquipmentData(body);
                });
            }
        }
    });
    $.widget('pic.body', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].setEquipmentData = function (data) { self.setEquipmentData(data); };
            el[0].setUnits = function (units) { self.setUnits(units); };
            el[0].setCircuitState = function (data) { self.setCircuitState(data); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.addClass('picBody');
            el.addClass('pic' + o.name);
            el.attr('data-body', o.name);
            el.attr('data-id', o.id);
            el.attr('data-circuitid', o.circuit);
            el.attr('data-ison', o.isOn);
            $('<div class="picBodyIcon">'
                + '<div><label class="picBodyText" /></div>'
                + '<div class="picIndicator"/></div>'

                + '<div class="picBodyTemp">'
                + '<div><label data-bind="name"></label><label class="picTempText"> Temp</label></div>'
                + '<div><span class="picTempData" data-bind="temp" data-fmttype="number" data-fmtmask="#,##0.#" data-fmtempty="--.-"/><label class="picUnitSymbol">&deg;</label><span class="picUnits">-</span></div>'
                + '</div>'

                + '<div class= "picBodySetPoints">'
                + '<div><label class="picInline-label picSetPointText">Set Point</label><span class="picSetPointData" data-bind="setPoint">--.-</span><label class="picUnitSymbol">&deg;</label><span class="picUnits">-</span><div>'
                + '<div><label class="picInline-label picSetPointText">Heat Mode</label><span class="picModeData" data-bind="heatMode.desc">----</span>'
                + '<div><label class="picInline-label picSetPointText">Heater Status</label><span class="picStatusData" data-bind="heatStatus.desc">----</span>'
                + '</div>'
            ).appendTo(el);
            el.on('click', 'div.picIndicator', function (evt) {
                let ind = $(evt.target);
                ind.attr('data-status', 'pending');
                $.putJSON('state/circuit/setState', { id: parseInt(el.attr('data-circuitid'), 10), state: !makeBool(ind.attr('data-state')) }, function () { });
                setTimeout(function () { ind.attr('data-status', makeBool(ind.attr('data-state')) ? 'on' : 'off'); }, 3000);
            });
            el.on('click', 'div.picBodySetPoints', function (evt) {
                var body = el;
                var settings = {
                    name: body.attr('data-body'),
                    heatMode: parseInt(body.attr('data-heatmode'), 10),
                    setPoint: parseInt(body.attr('data-setpoint'), 10)
                };
                $.getJSON('/config/body/' + el.attr('data-id') + '/heatModes', null, function (data, status, xhr) {
                    var divPopover = $('<div/>');
                    divPopover.appendTo(el.parent());
                    divPopover.on('initPopover', function (evt) {
                        $('<div><label class="picInline-label picSetpointText">' + body.attr('data-body') + ' Set Point</label><div class="picValueSpinner" data-bind="heatSetpoint"/></div>'
                            + '<div class= "picSelector" data-bind="heatMode" />').appendTo(evt.contents());
                        evt.contents().find('div.picValueSpinner').each(function () {
                            $(this).valueSpinner({ val: settings.setPoint, min: 65, max: 104, step: 1 });
                        });
                        evt.contents().find('div.picValueSpinner').on('change', function (e) {
                            //console.log(e);
                            self.putSetpoint(e.value);
                        });
                        evt.contents().find('div.picSelector').selector({ val: parseInt(body.attr('data-heatmode'), 10), test: 'text', opts: data });
                        evt.contents().find('div.picSelector').on('selchange', function (e) {
                            self.putHeatMode(parseInt(e.newVal, 10));
                        });
                    });
                    divPopover.popover({ title: body.attr('data-body') + ' Heat Settings', popoverStyle: 'modal', placement: { target: body } });
                    divPopover[0].show(body);
                    // Min/max 65F-104F
                });
            });
        },
        setEquipmentData: function (data) {
            var self = this, o = self.options, el = self.element;
            dataBinder.bind(el, data);
            el.find('div.picIndicator').attr('data-state', makeBool(data.isOn) ? 'on' : 'off');
            el.find('div.picIndicator').attr('data-status', data.isOn ? 'on' : 'off');
            el.attr('data-ison', data.isOn);
            el.attr('data-setpoint', data.setPoint);
            el.attr('data-heatmode', data.heatMode.val);
        },
        setCircuitState: function (data) {
            var self = this, o = self.options, el = self.element;
            el.find('div.picBodyIcon div.picIndicator').attr('data-status', data.isOn ? 'on' : 'off');
            el.find('div.picBodyIcon div.picIndicator').attr('data-state', data.isOn);
            el.find('label.picBodyText').text(data.name);
        },
        setUnits: function (units) {
            var self = this, o = self.options, el = self.element;
            el.find('*.picUnits').text(units.name);
        },
        putHeatMode: function (mode) {
            var self = this, o = self.options, el = self.element;
            $.putJSON('state/body/heatMode', { id: parseInt(el.attr('data-id'), 10), mode: mode }, function () { });
        },
        putSetpoint: function (setPoint) {
            var self = this, o = self.options, el = self.element;
            $.putJSON('state/body/setPoint', { id: parseInt(el.attr('data-id'), 10), setPoint: setPoint }, function () { });
        }
    });

    $.widget('pic.temps', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            var toggle = $('<div class="picFeatureToggle"/>');
            toggle.appendTo(el);
            toggle.toggleButton();
            var lbl = $('<label class="picFeatureLabel"/>');
            lbl.appendTo(el);
            lbl.text(o.name);
            if (typeof (o.showInFeatures) !== 'undefined' && !o.showInFeatures) el.hide();

        }
    });

    $.widget('pic.bodyHeatOptions', {
        options: {},
        _create: function() {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
        },
        _buildControls: function() {
            var self = this, o = self.options, el = self.element;

        }
    });
})(jQuery);
