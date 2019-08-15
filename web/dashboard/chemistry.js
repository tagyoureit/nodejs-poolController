(function ($) {
    $.widget("pic.chemistry", {
        options: { },
        _create: function () {
            var self = this, o = self.options, el = self.element;
            el[0].initChemistry = function(data) { self._initChemistry(data); };
        },
        _initChemistry: function(data) {
            var self = this, o = self.options, el = self.element;
            el.empty();
            let div = $('<div class="picCircuitTitle"/>');
            div.appendTo(el);
            let span = $('<span class="picCircuitTitle"/>');
            span.appendTo(div);
            span.text('Chemistry');

            for (let i = 0; i < data.chlorinators.length; i++) {
                let div = $('<div class="picChlorinator"/>');
                div.appendTo(el);
                div.chlorinator(data.chlorinators[i]);
            }
        }
    });
    $.widget('pic.chlorinator', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].setEquipmentData = function (data) { self.setEquipmentData(data); };
        },
        setEquipmentData: function (data) {
            var self = this, o = self.options, el = self.element;
            el.attr('data-saltrequired', data.saltRequired);
            //data.state = data.currentOutput > 0 ? 'on' : 'off';
            el.find('div.picChlorinatorState').attr('data-status', data.currentOutput > 0 ? 'on' : 'off');
            dataBinder.bind(el, data);
            let sc = el.find('div.picSuperChlor');
            if (data.superChlor) {
                sc.show();
                if (o.superChlorTimer) clearTimeout(o.superChlorTimer);
                if (data.superChlorRemaining > 0) {
                    o.superChlorTimer = setInterval(function () { self.countdownSuperChlor(); }, 1000);
                    el.find('div.picSuperChlorBtn label.picSuperChlor').text('Cancel Chlorinate');
                    el.find('div.picSuperChlorBtn div.picIndicator').attr('data-status', 'on');
                }
            }
            else {
                if (o.superChlorTimer) clearTimeout(o.superChlorTimer);
                o.superChlorTimer = null;
                sc.hide();
                el.find('div.picSuperChlorBtn label.picSuperChlor').text('Super Chlorinate');
                el.find('div.picSuperChlorBtn div.picIndicator').attr('data-status', 'off');
            }
            if (data.status.val === 128) el.find('div.picSuperChlorBtn').hide();
            else el.find('div.picSuperChlorBtn').show();
            el.data('remaining', data.superChlorRemaining);
        },
        countdownSuperChlor: function () {
            var self = this, o = self.options, el = self.element;
            let rem = Math.max(el.data('remaining') - 1);
            el.find('span.picSuperChlorRemaining').each(function () {
                $(this).text(dataBinder.formatDuration(rem));
            });
            el.data('remaining', rem);
        },
        putPoolSetpoint: function (setPoint) {
            var self = this, o = self.options, el = self.element;
            $.putJSON('state/chlorinator/poolSetpoint', { id: parseInt(el.attr('data-id'), 10), setPoint: setPoint }, function () { });

        },
        putSpaSetpoint: function (setPoint) {
            var self = this, o = self.options, el = self.element;
            $.putJSON('state/chlorinator/spaSetpoint', { id: parseInt(el.attr('data-id'), 10), setPoint: setPoint }, function () { });

        },
        putSuperChlorHours: function (hours) {
            var self = this, o = self.options, el = self.element;
            $.putJSON('state/chlorinator/superChlorHours', { id: parseInt(el.attr('data-id'), 10), hours: hours }, function () { });

        },
        putSuperChlorinate: function (bSet) {
            var self = this, o = self.options, el = self.element;
            if (!bSet) el.find('label.picSuperChlor').text('Cancelling...');
            else el.find('label.picSuperChlor').text('Initializing...');
            el.find('div.picToggleSuperChlor > div.picIndicator').attr('data-status', 'pending');
            $.putJSON('state/chlorinator/superChlorinate', { id: parseInt(el.attr('data-id'), 10), superChlorinate: bSet }, function () { });

        },
        _buildPopover: function () {
            var self = this, o = self.options, el = self.element;
            el.on('click', function (evt) {
                $.getJSON('state/chlorinator/' + el.attr('data-id'), function (data, status, xhr) {
                    var divPopover = $('<div class="picChlorSettings"/>');
                    divPopover.appendTo(el);
                    divPopover.on('initPopover', function (evt) {
                        let saltReqd = parseFloat(el.attr('data-saltrequired'));
                        if (saltReqd > 0) $('<div class="picSaltReqd"><i class="fas fa-bell"/><span> Add ' + (saltReqd/40).toFixed(2) + ' 40lb bags of salt</span></div>').appendTo(evt.contents());
                        if (data.body.val === 32 || data.body.val === 0) {
                            let divSetpoint = $('<div class="picPoolSetpoint picSetpoint"><label class="picInline-label picSetpointText">Pool Set Point</label><div class="picValueSpinner" data-bind="poolSetpoint"/></div>');
                            divSetpoint.appendTo(evt.contents());
                            divSetpoint.find('div.picValueSpinner').each(function () {
                                $(this).valueSpinner({ val: data.poolSetpoint, min: 0, max: 100, step: 1 });
                                $(this).on('change', function (e) { self.putPoolSetpoint(e.value); });
                            });
                        }
                        if (data.body.val === 32 || data.body.val === 1) {
                            // Add in the spa setpoint.
                            let divSetpoint = $('<div class="picSpaSetpoint picSetpoint"><label class="picInline-label picSetpointText">Spa Set Point</label><div class="picValueSpinner" data-bind="spaSetpoint"/></div>');
                            divSetpoint.appendTo(evt.contents());
                            divSetpoint.find('div.picValueSpinner').each(function () {
                                $(this).valueSpinner({ val: data.spaSetpoint, min: 0, max: 100, step: 1 });
                                $(this).on('change', function (e) { self.putSpaSetpoint(e.value); });
                            });
                        }
                        let divSuperChlorHours = $('<div class="picSuperChlorHours picSetpoint"><label class="picInline-label picSetpointText">Super Chlorinate</label><div class="picValueSpinner" data-bind="superChlorHours"/><label class="picUnits">Hours</label></div>');
                        divSuperChlorHours.appendTo(evt.contents());
                        divSuperChlorHours.find('div.picValueSpinner').each(function () {
                            $(this).valueSpinner({ val: data.superChlorHours, min: 1, max: 96, step: 1 });
                            $(this).on('change', function (e) { self.putSuperChlorHours(e.value); });
                        });

                        // Add in the super chlorinate button.
                        let btn = $('<div class="picSuperChlorBtn"/>');
                        btn.appendTo(evt.contents());

                        let toggle = $('<div class="picToggleSuperChlor"/>');
                        toggle.appendTo(btn);
                        toggle.toggleButton();
                        let lbl = $('<div><div><label class="picSuperChlor">Super Chlorinate</label></div><div class="picSuperChlorRemaining"><span class="picSuperChlorRemaining" data-bind="superChlorRemaining" data-fmttype="duration"/></div></div>');
                        lbl.appendTo(btn);
                        btn.on('click', function (e) {
                            e.preventDefault();
                            let bSet = makeBool(btn.find('div.picIndicator').attr('data-status') !== 'on');
                            self.putSuperChlorinate(bSet);
                        });
                        if (data.status.val === 128) btn.hide();
                        self.setEquipmentData(data);
                    });
                    divPopover.on('click', function (e) { e.stopImmediatePropagation(); e.preventDefault(); });
                    divPopover.popover({ title: 'Chlorinator Settings', popoverStyle: 'modal', placement: { target: evt.target } });
                    divPopover[0].show(evt.target);
                });
                evt.preventDefault();
                evt.stopImmediatePropagation();
            });
        },
        _buildControls: function() {
            var self = this, o = self.options, el = self.element;
            var div = $('<div class="picChlorinatorState picIndicator"/>');
            el.attr('data-id', o.id);
            div.appendTo(el);
            div.attr('data-ison', o.currentOutput > 0);
            div.attr('data-status', o.currentOutput > 0 ? 'on' : 'off');
            $('<label class="picChlorinatorName" data-bind="name" />').appendTo(el);
            $('<div class="picChlorStatus picData"><label class="picInline-label">Status</label><span class="picStatus" data-bind="status.desc" /></div>').appendTo(el);
            $('<div class="picSaltLevel picData"><label class="picInline-label">Salt Level</label><span class="picSaltLevel" data-bind="saltLevel" data-fmttype="number" data-fmtmask="#,##0" data-fmtempty="----" /><label class="picUnits">ppm</label></div>').appendTo(el);
            $('<div class="picCurrentOutput picData"><label class="picInline-label">Output</label><span class="picCurrentOutput" data-bind="currentOutput" /><label class="picUnits">%</label></div>').appendTo(el);
            $('<div class="picSuperChlor picData"><label class="picInline-label">Super Chlor:</label><span class="picSuperChlorRemaining" data-bind="superChlorRemaining" data-fmttype="duration" /></div>').appendTo(el);
            self.setEquipmentData(o);
            self._buildPopover();
        }
    });
})(jQuery);
