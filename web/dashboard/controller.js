(function ($) {
    $.widget("pic.controller", {
        options: { },
        _create: function () {
            var self = this, o = self.options, el = self.element;
            el[0].initController = function (data) { self._initController(data); };
            el[0].setControllerState = function (data) { self.setControllerState(data); };
            el[0].setEquipmentState = function (data) { self.setEquipmentState(data); };
            el[0].setConnectionError = function (data) { self.setConnectionError(data); }
        },
        _initController: function(data) {
            var self = this, o = self.options, el = self.element;
            let div = $('<div class="picControllerTitle picControllerTime"><span /></div>');
            div.appendTo(el);
            div = $('<div class="picControllerLine picModel"><span class="picModelData"/></div>');
            div.appendTo(el);
            div = $('<div class="picControllerLine picStatus"><label class="picInline-label">Status</label><span class="picStatusData"/><span class="picPercentData"/><div class="picIndicator" data-status="error" style="float:right;"/></div>');
            div.appendTo(el);
            div = $('<div class="picControllerLine picMode"><label class="picInline-label">Mode</label><span class="picModeData"/></div>');
            div.appendTo(el);
            div = $('<div class="picControllerLine picFreeze"><label class="picInline-label">Freeze</label><span class="picFreezeData"/></div>');
            div.appendTo(el);
            self.setControllerState(data);
            self.setEquipmentState(data.equipment);
        },
        formatDate: function (dt) {
            let pad = function (n) { return (n < 10 ? '0' : '') + n; };
            return pad(dt.getMonth() + 1) + '/' + pad(dt.getDate()) + '/' + dt.getFullYear() + '  '
                + pad(dt.getHours() > 12 ? dt.getHours() - 12 : dt.getHours()) + ':' + pad(dt.getMinutes()) + (dt.getHours() >= 12 ? 'pm' : 'am');
        },
        setConnectionError: function (data) {
            var self = this, o = self.options, el = self.element;
            el.find('div.picControllerTime > span').each(function () {
                $(this).text('--/--/---- --:--');
            });
            el.find('div.picStatus').each(function () {
                let ln = $(this);
                ln.find('span.picPercentData').text('');
                ln.find('span.picStatusData').text(data.status.desc);
                ln.find('div.picIndicator').attr('data-status', data.status.name);
            });
            el.find('div.picMode > span.picModeData').text('------');
            el.find('div.picFreeze > span.picFreezeData').text('--');

        },
        setControllerState: function (data) {
            var self = this, o = self.options, el = self.element;
            let dt = new Date(data.time);
            el.find('div.picControllerTime > span').each(function () {
                $(this).text(self.formatDate(dt));
            });
            el.find('div.picStatus').each(function () {
                let ln = $(this);
                ln.find('span.picPercentData').text(data.status.name === 'loading' ? data.status.percent + '%' : '');
                ln.find('span.picStatusData').text(data.status.desc);
                ln.find('div.picIndicator').attr('data-status', data.status.name);
            });
            el.find('div.picMode > span.picModeData').text(data.mode.desc);
            el.find('div.picFreeze > span.picFreezeData').text(data.freeze ? 'On' : 'Off');
        },
        setEquipmentState: function (data) {
            var self = this, o = self.options, el = self.element;
            el.attr('data-maxbodies', data.maxBodies);
            el.attr('data-maxvalves', data.maxValves);
            el.attr('data-maxcircuits', data.maxCircuits);
            el.attr('data-shared', data.shared);
            el.find('div.picModel > span.picModelData').text('Intellicenter ' + data.model);
        }
    });
})(jQuery);
