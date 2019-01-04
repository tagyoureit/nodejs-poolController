/* jshint undef: false, unused: true , latedef: false*/

/* global Storage */
var autoDST; // Flag for Automatic DST (0 = manual, 1 = automatic)
var tmeLastUpd; // Time of Last Update (last socket message received)
var socket; // Socket IO (don't initalize communications until clientConfig.json received!)
var currCircuitArr; // keep a local copy of circuits so we can use them to allow schedule changes
var prevPumpMode = {1: {mode: '', value: ''}, 2: {mode: '', value: ''}};  // keep track of the previous virtualpumpcontroller modes
/**
 * jQuery.browser.mobile (http://detectmobilebrowser.com/)
 *
 * jQuery.browser.mobile will be true if the browser is a mobile device
 *
 **/
(function (a) {
    (jQuery.browser = jQuery.browser || {}).mobile = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))
})(navigator.userAgent || navigator.vendor || window.opera);


//Configure Bootstrap Panels, in 2 steps ...
//   1) Enable / Disable panels as configured (in json file)
//   2) Load Panel Sequence from Storage (as saved from last update)
function configPanels(jsonPanel) {
    //Enable / Disable panels as configured (in json file)
    for (var currPanel in jsonPanel) {
        if (jsonPanel[currPanel]["state"] === "hidden")
            $('#' + currPanel).hide();
        else if (jsonPanel[currPanel]["state"] === "collapse")
            $('#' + 'collapse' + currPanel.capitalizeFirstLetter()).collapse();
        else
            $('#' + currPanel).show();
        // Debug Panel -> Update Debug Log Button
        if (currPanel === "debug") {
            if (jsonPanel[currPanel]["state"] === "hidden")
                setStatusButton($('#debugEnable'), 0, 'Debug:<br/>');
            else
                setStatusButton($('#debugEnable'), 1, 'Debug:<br/>');
        }
    }

    // Load Panel Sequence from Storage (as saved from last update)
    if (typeof(Storage) !== "undefined") {
        var panelIndices = JSON.parse(localStorage.getItem('panelIndices'));
        // Make sure list loaded from Storage is not empty => if so, just go with default as in index.html
        if (panelIndices) {
            var panelList = $('#draggablePanelList');
            var panelListItems = panelList.children();
            // And, only reorder if no missing / extra items => or items added, removed ... so "reset" to index.html
            var sizeStorage = panelIndices.filter(function (value) {
                return value !== null
            }).length;
            if (sizeStorage === panelListItems.length) {
                panelListItems.detach();
                $.each(panelIndices, function () {
                    var currPanel = this.toString();
                    var result = $.grep(panelListItems, function (e) {
                        return e.id === currPanel;
                    });
                    panelList.append(result);
                });
            }
        }
    } else {
        $('#txtDebug').append('Sorry, your browser does not support Web Storage.' + '<br>');
    }
}

//Routine to recursively parse Equipment Configuration, setting associated data for DOM elements
function dataAssociate(strControl, varJSON) {
    for (var currProperty in varJSON) {
        if (typeof varJSON[currProperty] !== "object") {
            $('#' + strControl).data(currProperty, varJSON[currProperty]);
        } else {
            if (Array.isArray(varJSON)) {
                dataAssociate(strControl, varJSON[currProperty]);
            } else {
                dataAssociate(currProperty, varJSON[currProperty]);
            }
        }
    }
}

function monthOfYearAsString(indDay) {
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][indDay];
}

function dayOfWeekAsInteger(strDay) {
    return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(strDay.capitalizeFirstLetter(strDay));
}

function dayOfWeekAsString(indDay) {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][indDay];
}

// Format Time (String), to 12 hour format. Input is HH:MM, Output is HH:MM am/pm
function fmt12hrTime(strInpStr) {
    // Make sure input is in 24 hour time ... if not, don't convert
    if (strInpStr.toUpperCase().search("M") >= 0)
        return strInpStr;
    else {
        splitInpStr = strInpStr.split(":");
        if (splitInpStr[0] < 12)
            strAMPM = 'am';
        else
            strAMPM = 'pm';
        strHours = (parseInt(splitInpStr[0]) % 12).toFixed(0);
        if (strHours === "0")
            strHours = "12";
        strMins = ('0' + parseInt(splitInpStr[1])).slice(-2);
        return strHours + ':' + strMins + ' ' + strAMPM;
    }
}

// Format Time (String), to 24 hour format. Input is HH:MM am/pm, Output is HH:MM
function fmt24hrTime(strInpStr) {
    // Make sure input is in 12 hour time ... if not, don't convert
    if (strInpStr.toUpperCase().search("M") < 0)
        return strInpStr;
    else {
        splitInpStr = strInpStr.slice(0, -3).split(":");
        intAMPM = (strInpStr.slice(-2).toUpperCase() === "AM") ? 0 : 1;
        strHours = ((parseInt(splitInpStr[0]) % 12) + (12 * intAMPM)).toFixed(0);
        if (strHours === "0")
            strHours = "00";
        strMins = ('0' + parseInt(splitInpStr[1])).slice(-2);
        return strHours + ':' + strMins;
    }
}

function fmtEggTimerTime(strInpStr) {
    splitInpStr = strInpStr.split(":");
    strHours = splitInpStr[0];
    strMins = ('0' + parseInt(splitInpStr[1])).slice(-2);
    return strHours + ' hrs, ' + strMins + ' mins';
}

function insertSelectPickerCircuits(el, currSchedule) {
    if (Object.keys(currCircuitArr).length > 1) {
        $.each(currCircuitArr, function (index, currCircuit) {
            if (currCircuit.friendlyName.toUpperCase() !== "NOT USED" && ((appParams.equipment.circuit.hideAux === false) || (currCircuit.friendlyName.indexOf("AUX") === -1))) {
                var selected = '';
                if (currCircuit.friendlyName.toUpperCase() === currSchedule.friendlyName.toUpperCase()) {
                    selected = 'selected'
                }
                $('#' + el).append($('<option>', {
                    "data-circuitnum": currCircuit.number,
                    class: selected,
                    text: currCircuit.friendlyName.capitalizeFirstLetter()

                }))
            }
        })
        $('#' + el).append($('<option/>', {
            'data-divider': "true"
        })).append($('<option/>', {
            style: "color: red;",
            text: "DELETE"
        }))
    }
}

function bindClockPicker(el, _align) {
    $(el).clockpicker({
        donetext: 'OK',
        twelvehour: false,
        align: _align,
        autoclose: true,
        beforeShow: function () {
            $(el).val(fmt24hrTime($(el).val()));
        },
        afterShow: function () {
            $(el).val(fmt12hrTime($(el).val()));
        },
        afterHide: function () {
            $(el).val(fmt12hrTime($(el).val()));
        },
        afterDone: function () {
            $(el).val(fmt12hrTime($(el).val()));
            $(el).attr("value", fmt12hrTime($(el).val()))
            var newTime = fmt24hrTime($(el).val())
            var timeArr = newTime.split(':')
            socket.emit('setScheduleStartOrEndTime', $(el).data("id"), $(el).data("startorend"), timeArr[0], timeArr[1]);
        }
    })
}


// Add last row to schedule/egg timer if there is an available slot
function bindSelectPickerScheduleCircuit(el, _default) {
    // To style only <select>s with the selectpicker class
    $(el).selectpicker({
        mobile: jQuery.browser.mobile, //if true, use mobile native scroll, else format with selectpicker css
    });
    $(el).selectpicker('val', _default)
    $(el).on('changed.bs.select', function (e, clickedIndex, newValue, oldValue) {
        if ($(el).val() === "DELETE") {
            socket.emit('deleteScheduleOrEggTimer', $(el).closest('tr').data('id'))
        } else {
            socket.emit('setScheduleCircuit', $(el).closest('tr').data('id'), $(el).find('option:selected').data('circuitnum'))
        }
        $(el).prop('disabled', true)
        $(el).selectpicker('refresh')
    })
}

function bindSelectPickerHour(el, _default) {
    // To style only <select>s with the selectpicker class
    $(el).selectpicker({
        mobile: jQuery.browser.mobile, //if true, use mobile native scroll, else format with selectpicker css
    });
    $(el).selectpicker('val', _default)
    $(el).on('changed.bs.select', function (e, clickedIndex, newValue, oldValue) {
        socket.emit('setEggTimer', $(el).closest('tr').data('id'), $(el).closest('tr').data('circuitnum'), $(el).val(), $(el).closest('tr').data('min'))
        //console.log('egg id: %s  hour changed to %s.  circuit %s.  min %s', $(el).closest('tr').data('id'), $(el).val(), $(el).closest('tr').data('circuitnum'), $(el).closest('tr').data('min'))
        //console.log('setEggTimer', $(el).closest('tr').data('id'), $(el).closest('tr').data('circuitnum'), $(el).val(), $(el).closest('tr').data('min'))
        $(el).prop('disabled', true)
        $(el).selectpicker('refresh')
    })
}


function bindSelectPickerMin(el, _default) {
    // To style only <select>s with the selectpicker class
    $(el).selectpicker({
        mobile: jQuery.browser.mobile, //if true, use mobile native scroll, else format with selectpicker css
    });
    $(el).selectpicker('val', _default)
    $(el).on('changed.bs.select', function (e, clickedIndex, newValue, oldValue) {
        socket.emit('setEggTimer', $(el).closest('tr').data('id'), $(el).closest('tr').data('circuitnum'), $(el).closest('tr').data('hour'), $(el).val())
        //console.log('setEggTimer', $(el).closest('tr').data('id'), $(el).closest('tr').data('circuitnum'), $(el).closest('tr').data('hour'), $(el).val())
        $(el).prop('disabled', true)
        $(el).selectpicker('refresh')
    })
}

function buildEditRowSchedule(el, currSchedule) {
    schName = 'schTime' + currSchedule.ID

    // insert static row
    var hideEl = '';
    if (!$('#editPanelschedule').hasClass('btn-success'))
        hideEl = 'none;'
    $(el + ' tbody')
        .append(
            ($('<tr/>', {
                    id: schName,
                    class: "botpad schEdit",
                    'data-id': currSchedule.ID,
                    style: 'display:' + hideEl
                })
            )
                .append($('<td/>', {
                    text: currSchedule.ID
                })))


    var scheduleSelectPickerId = 'schTime' + currSchedule.ID + 'Circuit'
    $(el + ' tbody tr[data-id="' + currSchedule.ID + '"].schEdit')
        .append(
            ($('<td/>')
                .append(($('<div/>', {
                        class: 'input-group',
                        style: 'width:150px',
                    }))
                        .append($('<select/>', {
                            class: 'selectpicker show-menu-arrow show-tick',
                            id: scheduleSelectPickerId
                        }))
                ))
        )
        .append(
            ($('<td/>'))
                .append(
                    ($('<div/>', {class: 'input-group', style: "width:85px"}))
                        .append(
                            $('<input/>', {
                                class: 'form-control',
                                id: schName + 'StartTime',
                                'data-startorend': 'start',
                                'data-id': currSchedule.ID,
                                value: fmt12hrTime(currSchedule.START_TIME),
                                readonly: true
                            })
                        )
                )
        )
        .append(
            ($('<td/>'))
                .append(
                    ($('<div/>', {class: 'input-group', style: "width:85px"}))
                        .append($('<input/>', {
                            class: 'form-control',
                            id: schName + 'EndTime',
                            'data-startorend': 'end',
                            'data-id': currSchedule.ID,
                            value: fmt12hrTime(currSchedule.END_TIME),
                            readonly: true
                        })))
        )
    insertSelectPickerCircuits(scheduleSelectPickerId, currSchedule)
    bindClockPicker('#schTime' + currSchedule.ID + 'StartTime', 'left')
    bindClockPicker('#schTime' + currSchedule.ID + 'EndTime', 'right')
    bindSelectPickerScheduleCircuit('#schTime' + currSchedule.ID + 'Circuit', currSchedule.friendlyName.capitalizeFirstLetter())
}

// from https://stackoverflow.com/a/10073788/7386278
function pad(n, width, z) {
    return (String(z).repeat(width) + String(n)).slice(String(n).length)
}

// from https://stackoverflow.com/a/49097740/7386278
function compareTimeAgtB(a, b){
    var timeA = new Date();
    timeA.setHours(a.split(":")[0],a.split(":")[1]);
    var timeB = new Date();
    timeB.setHours(b.split(":")[0],b.split(":")[1]);
    if(timeA>=timeB)
        return true
    else
        return false
}

function buildStaticRowSchedule(el, currSchedule) {

    schName = 'schTime' + currSchedule.ID + 'Static'

    // console.log('currsched time %s (%s) to %s (%s) ', fmt12hrTime(currSchedule.START_TIME), currSchedule.START_TIME, fmt12hrTime(currSchedule.END_TIME), currSchedule.END_TIME)

    _currTime = new Date()
    _currHours = pad(_currTime.getHours(), 2, "0")
    _currMins = pad(_currTime.getMinutes(),2 , "0")
    _currTimeStr = _currHours + ":" + _currMins

    // console.log('currTimeStr: ', _currTimeStr)
    // console.log('time between stand and end: %s and %s ', compareTimeAgtB(_currTimeStr, currSchedule.START_TIME), compareTimeAgtB(currSchedule.END_TIME, _currTimeStr))

    var cssFontWeight = 'normal'
    var cssColor = 'black'
    if (compareTimeAgtB(_currTimeStr, currSchedule.START_TIME) & compareTimeAgtB(currSchedule.END_TIME, _currTimeStr)){
        // current time is between schedule start and end time
        cssFontWeight = 'bold'
        cssColor = 'blue'
    }
    else {
        cssFontWeight = 'normal'
        cssColor = 'black'
    }

    var hideEl = '';
    if ($('#editPanelschedule').hasClass('btn-success'))
        hideEl = 'none;'
    $(el + ' tbody')
        .append(
            ($('<tr/>', {
                    id: schName,
                    class: "botpad schStatic",
                    'data-id': currSchedule.ID,
                    style: 'display:' + hideEl + ' ;font-weight:'+cssFontWeight+ ';color:'
                })

            )
                .css('display', hideEl)
                .css('font-weight', cssFontWeight)
                .css('color', cssColor)
                .append($('<td/>', {
                    text: currSchedule.ID
                }))
                .append($('<td/>', {
                    text: currSchedule.friendlyName.capitalizeFirstLetter()
                }))
                .append($('<td/>', {
                    text: fmt12hrTime(currSchedule.START_TIME)
                }))
                .append($('<td/>', {
                    text: fmt12hrTime(currSchedule.END_TIME)
                }))
        ).append(buildSchDays(currSchedule))
}

function buildSchDays(currSchedule) {
    if ($('#editPanelschedule').hasClass('btn-success')) {
        disableEl = false
        classEl = ''
    }
    else {
        disableEl = true
        classEl = 'btn-schDays-Static'
    }
    schName = 'schDays' + currSchedule.ID;
    var _sched = $('<tr/>', {
        id: schName,
        class: "borderless toppad botpad",
        'data-id': currSchedule.ID,
        name: schName
    }).append($('<td/>', {
        colspan: 4,
        align: "left"
    }))


    var arrDays = [false, false, false, false, false, false, false];
    splitDays = currSchedule.DAYS.split(" ");
    $.each(splitDays, function (indx, currDay) {
        if (currDay !== "")
            arrDays[dayOfWeekAsInteger(currDay)] = true;
    });
    strHTML = '';
    for (var iterDay in arrDays) {
        strCurrDay = dayOfWeekAsString(iterDay);
        var btnclass = 'btn-default'
        if (arrDays[iterDay] === true)
            btnclass = 'btn-success'

        _sched.find('td').append($('<button/>', {
            class: "btn-sm  scheduleDays " + btnclass + " " + classEl,
            // id: strCurrDay,
            text: strCurrDay,
            'data-schId': currSchedule.ID,
            disabled: disableEl
        }))

    }
    return _sched
}

function buildSchTime(el, currSchedule) {
    buildEditRowSchedule(el, currSchedule)
    buildStaticRowSchedule(el, currSchedule)
}

function buildEditRowEggTimer(el, currSchedule) {
    schName = 'schEgg' + currSchedule.ID;

    splitInpStr = currSchedule.DURATION.split(":");
    strHours = splitInpStr[0];
    strMins = parseInt(('0' + parseInt(splitInpStr[1])).slice(-2));

    // insert static row
    var hideEl = '';
    if (!$('#editPaneleggtimer').hasClass('btn-success'))
        hideEl = 'none;'
    $(el + ' tbody')
        .append(
            ($('<tr/>', {
                    id: schName + 'Edit', //check if this is really needed
                    class: "botpad eggEdit",
                    'data-id': currSchedule.ID,
                    'data-circuitnum': currSchedule.CIRCUITNUM,
                    'data-hour': strHours,
                    'data-min': strMins,
                    style: 'display:' + hideEl
                })
            )
                .append($('<td/>', {
                    text: currSchedule.ID
                })))


    var scheduleSelectPickerId = 'schEgg' + currSchedule.ID + 'Circuit'
    $(el + ' tbody tr[data-id="' + currSchedule.ID + '"].eggEdit')
        .append(
            ($('<td/>')
                .append(($('<div/>', {
                        class: 'input-group',
                        style: 'width:150px',
                    }))
                        .append($('<select/>', {
                            class: 'selectpicker show-menu-arrow show-tick',
                            id: scheduleSelectPickerId,
                            'data-id': currSchedule.ID,
                        }))
                ))
        )
        .append(
            ($('<td/>'))
                .append(
                    ($('<div/>', {class: 'input-group', style: "width:55px"}))
                        .append(
                            $('<select/>', {
                                class: 'selectpicker show-menu-arrow show-tick',
                                id: schName + 'Hour'
                            })
                        )
                )
        )
        .append(
            ($('<td/>'))
                .append(
                    ($('<div/>', {class: 'input-group', style: "width:55px"}))
                        .append($('<select/>', {
                            class: 'selectpicker show-menu-arrow show-tick',
                            id: schName + 'Min'
                        })))
        )

    // append Hours to option
    for (i = 0; i <= 11; i++) {
        _selected = ''
        if (i === parseInt(strHours)) {
            _selected = "selected"
        }
        $('#' + schName + 'Hour').append($('<option/>', {text: i, selected: _selected}))
    }


    // append Mins to option
    for (i = 0; i <= 3; i++) {
        _selected = ''
        if (i * 15 === parseInt(strMins)) {
            _selected = "selected"
        }
        $('#' + schName + 'Min').append($('<option/>', {text: i * 15, selected: _selected}))
    }

    //bindSelectPickerEggTimerCircuit('#schEgg' + currSchedule.ID + 'Circuit', currSchedule.friendlyName.capitalizeFirstLetter())
    bindSelectPickerHour('#schEgg' + currSchedule.ID + 'Hour', strHours)
    bindSelectPickerMin('#schEgg' + currSchedule.ID + 'Min', strMins)

    insertSelectPickerCircuits(scheduleSelectPickerId, currSchedule)
    bindSelectPickerScheduleCircuit('#schEgg' + currSchedule.ID + 'Circuit', currSchedule.friendlyName.capitalizeFirstLetter())

}

function buildStaticRowEggTimer(el, currSchedule) {
    schName = 'schEgg' + currSchedule.ID;

    // insert static row
    var hideEl = '';
    if ($('#editPaneleggtimer').hasClass('btn-success'))
        hideEl = 'none;'
    $(el + ' tbody').append(
        ($('<tr/>', {
                id: schName,
                class: "botpad eggStatic",
                'data-id': currSchedule.ID,
                style: 'display:' + hideEl
            })
                .append(
                    $('<td/>', {
                        text: currSchedule.ID
                    })
                )
                .append(
                    $('<td/>', {
                        text: currSchedule.friendlyName.capitalizeFirstLetter()
                    })
                )
                .append(
                    $('<td/>', {
                        text: fmtEggTimerTime(currSchedule.DURATION)
                    }))
        )
    )


}

function insertAddSchedule(currSchedule, idOfFirstNotUsed) {
    // add the "Not Used" circuit to the Schedules in Edit Mode

    hideEl = ''
    if (!$('#editPanelschedule').hasClass('btn-success'))
        hideEl = "none"
    $('#schedules').append(
        ($('<tr/>', {class: 'schEdit', style: 'display:' + hideEl}))
            .append($('<td/>', {text: idOfFirstNotUsed}))
            .append(
                ($('<td/>'))
                    .append(
                        ($('<div/>', {class: 'input-group', style: 'width:150px'}))
                            .append(
                                ($('<select/>', {
                                    class: "selectpicker show-menu-arrow show-tick",
                                    id: "addScheduleCircuit"
                                }))
                                    .append($('<option/>', {text: 'Not Used'})))
                    )
            )
            .append(
                ($('<td/>', {colspan: 2})
                        .append(
                            ($('<a/>', {
                                tabindex: 0,
                                class: 'btn',
                                role: 'button',
                                'data-toggle': 'popover',
                                'data-trigger': 'focus',
                                title: 'Add a schedule',
                                'data-content': "Select a circuit to add a schedule.  It will default to run from 8am-9am on no days and you can refine it further from there.<p>Note: If slots are available, they will show in both egg timers and schedules.  Select in the appropriate section to add it.</p> <p>The option to add additional circuits will not appear if none are available.</p>",
                                text: 'Adding a schedule'
                            }))
                                .prepend($('<span/>', {
                                    class: "glyphicon glyphicon-info-sign",
                                    'aria-hidden': "true"
                                }))
                        )
                )
            )
    )

    insertSelectPickerCircuits('addScheduleCircuit', currSchedule)
    bindNotUsedSchedule()

}

function bindNotUsedSchedule() {
    $('#addScheduleCircuit').selectpicker({
        mobile: jQuery.browser.mobile, //if true, use mobile native scroll, else format with selectpicker css
    });
    $('#addScheduleCircuit').on('changed.bs.select', function (e, clickedIndex, newValue, oldValue) {
        socket.emit('setSchedule', $('#scheduleIdNotUsed').data('id'), $('#addScheduleCircuit').find('option:selected').data('circuitnum'), 8, 0, 9, 0, 128) // we pull #scheduleIdNotUsed from egg timer, but it is the same for both
        //console.log('setSchedule', $('#scheduleIdNotUsed').data('id'), $('#addScheduleCircuit').find('option:selected').data('circuitnum'),8,0,9,0,0)
        $('#addScheduleCircuit').prop('disabled', true)
        $('#addScheduleCircuit').selectpicker('refresh')
    })
}


function insertAddEggTimer(currSchedule, idOfFirstNotUsed) {

    // add the "Not Used" circuit to the Egg Timer in Edit Mode

    hideEl = ''
    if (!$('#editPaneleggtimer').hasClass('btn-success'))
        hideEl = "none"
    $('#eggtimers').append(
        ($('<tr/>', {class: 'eggEdit', style: 'display:' + hideEl}))
            .append($('<td/>', {text: idOfFirstNotUsed, 'data-id': idOfFirstNotUsed, id: 'scheduleIdNotUsed'}))
            .append(
                ($('<td/>'))
                    .append(
                        ($('<div/>',
                            {
                                class: 'input-group',
                                style: 'width:150px'
                            }))
                            .append(
                                ($('<select/>', {
                                    class: "selectpicker show-menu-arrow show-tick",
                                    id: "addEggTimerCircuit"
                                }))
                                    .append($('<option/>', {text: 'Not Used'})))
                    )
            )
            .append(
                ($('<td/>',
                        {
                            colspan: 2
                        })
                        .append(
                            ($('<a/>', {
                                tabindex: 0,
                                class: 'btn',
                                role: 'button',
                                'data-toggle': 'popover',
                                'data-trigger': 'focus',
                                title: 'Add an egg timer',
                                'data-content': "Select a circuit to add an egg timer.  It will default to 2 hours, 0 mins and you can refine it from there.</p>  <p>Note: If slots are available, they will show in both egg timers and schedules.  Select in the appropriate section to add it.</p> <p>The option to add additional circuits will not appear if there are no available slots.</p>",
                                text: 'Adding an egg timer'
                            }))
                                .prepend($('<span/>', {
                                    class: "glyphicon glyphicon-info-sign",
                                    'aria-hidden': "true"
                                }))
                        )
                )
            )
    )

    insertSelectPickerCircuits('addEggTimerCircuit', currSchedule)
    bindNotUsedEggTimer()

}

function insertLightEdit() {
    /*

        "7": {
            "number": 7,
            "numberStr": "circuit7",
            "name": "SPA LIGHT",
            "circuitFunction": "Intellibrite",
            "status": 0,
            "freeze": 0,
            "macro": 0,
            "delay": 0,
            "friendlyName": "SPA LIGHT",
            "light": {
                "position": 1,
                "colorStr": "off",
                "color": 0,
                "colorSet": 0,
                "colorSetStr": "White",
                "prevColor": 0,
                "prevColorStr": "White",
                "colorSwimDelay": 0,
                "mode": 0,
                "modeStr": "Off"
            }
        }
         */
    el = '#lightsEdit'

    // first get number of intellibrite lights
    var lightCount = 0
    $.each(currCircuitArr, function (indx, currCircuit) {
        // loop through each circuit
        if (currCircuit.circuitFunction === 'Intellibrite') {
            lightCount += 1;
        }
    })

    // reset the table
    $('#lightsEdit tbody').html("")

    $.each(currCircuitArr, function (indx, currCircuit) {
        // loop through each circuit
        if (currCircuit.circuitFunction === 'Intellibrite' && currCircuit.hasOwnProperty('light')) {

            circuitID = 'light' + indx;

            // insert static column
            var hideEl = '';
            if (!$('#editPanelLight').hasClass('btn-success'))
                hideEl = 'none;'

            // circuit #
            $(el + ' tbody')
                .append(
                    ($('<tr/>', {
                            id: currCircuit.numberStr + 'Edit', //check if this is really needed
                            class: "botpad lightEdit",
                            'data-id': indx,
                            // 'data-circuitnum': currSchedule.CIRCUITNUM,
                            // 'data-hour': strHours,
                            // 'data-min': strMins,
                            style: 'display:' + hideEl
                        })
                    )
                        .append($('<td/>', {
                            text: indx
                        })))


            $(el + ' tbody tr[data-id="' + indx + '"].lightEdit')
            // circuit name
                .append(
                    ($('<td/>', {
                            text: currCircuit.friendlyName
                        })
                    )
                )
                // color
                .append(
                    ($('<td/>'))
                        .append(
                            ($('<div/>', {
                                //class: 'input-group',
                                //style: "width:55px"
                            }))
                                .append($('<select/>', {
                                    class: 'bootstrap-select',
                                    id: currCircuit.numberStr + 'Color',
                                    "data-width": "auto",
                                    "data-circuitnum": indx
                                })))
                )
                // position
                .append(
                    ($('<td/>'))
                        .append(
                            ($('<div/>', {
                                //class: 'input-group',
                                //style: "width:55px"
                            }))
                                .append(
                                    $('<select/>', {
                                        class: 'bootstrap-select',
                                        id: currCircuit.numberStr + 'Position',
                                        "data-width": "auto",
                                        "data-circuitnum": indx
                                    })
                                )
                        )
                )
                // swim delay
                .append(
                    ($('<td/>'))
                        .append(
                            ($('<div/>', {
                                //class: 'col-xs-3',
                                //style: "width:55px"
                            }))
                                .append($('<select/>', {
                                    class: 'bootstrap-select',
                                    id: currCircuit.numberStr + 'SwimDelay',
                                    "data-width": "auto",
                                    "data-circuitnum": indx
                                })))
                )


            // append colors to select-picker
            $('#' + currCircuit.numberStr + 'Color')
                .append($('<option/>', {
                    text: "White",
                    // "data-type": "lightColor",
                    "data-val": 0,
                    "style": "color:white;background:gray",
                    "data-content": "<div style='color:white;background:gray'>White</div>"
                }))
                .append($('<option/>', {
                    text: "Light Green",
                    // "data-type": "lightColor",
                    "data-val": 2,
                    "style": "color:lightgreen", "data-content": "<div style='color:lightgreen'>Light Green</div>"
                }))
                .append($('<option/>', {
                    text: "Green",
                    // "data-type": "lightColor",
                    "data-val": 4,
                    "style": "color:green",
                    "data-content": "<div style='color:green'>Green</div>"
                }))
                .append($('<option/>', {
                    text: "Cyan",
                    // "data-type": "lightColor",
                    "data-val": 6,
                    "style": "color:cyan",
                    "data-content": "<div style='color:cyan'>Cyan</div>"

                }))
                .append($('<option/>', {
                    text: "Blue",
                    // "data-type": "lightColor",
                    "data-val": 8,
                    "style": "color:blue",
                    "data-content": "<div style='color:blue'>Blue</div>"
                }))
                .append($('<option/>', {
                    text: "Lavender",
                    // "data-type": "lightColor",
                    "data-val": 10,
                    "style": "color:lavender",
                    "data-content": "<div style='color:lavender'>Lavender</div>"
                }))
                .append($('<option/>', {
                    text: "Magenta",
                    "data-val": 12,
                    "style": "color:magenta",
                    "data-content": "<div style='color:darkmagenta'>Magenta</div>"
                }))
                .append($('<option/>', {
                    text: "Light Magenta",
                    "data-val": 14,
                    "style": "color:magenta",
                    "data-content": "<div style='color:magenta'>Light Magenta</div>"
                }))

            // light position section
            for (i = 1; i <= lightCount; i++) {
                // append light positions to select-picker
                $('#' + currCircuit.numberStr + 'Position')
                    .append($('<option/>', {
                        text: i,
                        "data-val": i
                    }))
            }


            // swim delay section
            for (i = 0; i <= 60; i++) {
                $('#' + currCircuit.numberStr + 'SwimDelay')
                    .append($('<option/>', {
                        text: i,
                        "data-val": i
                    }))
            }

            bindLightColorSelectPicker('#' + currCircuit.numberStr + 'Color', currCircuit.light.colorSetStr)
            bindLightPosition('#' + currCircuit.numberStr + 'Position', currCircuit.light.position)
            bindLightSwimDelay('#' + currCircuit.numberStr + 'SwimDelay', currCircuit.light.colorSwimDelay)

        }
        else if (currCircuit.circuitFunction === 'Intellibrite'){
            console.log('Circuit %s has function %s but no light section associated with it.', currCircuit.number, currCircuit.circuitFunction)
        }

    })

}

var lightSelectPickerBound = 0

function bindLightSelectPicker() {

    el = '#lightSelectPicker'

    // need logic to turn off intellibrite mode if all circuits are off
    // don't think there is a way to do this from RS485 messages

    $.each(currCircuitArr, function (indx, currCircuit) {

        if (currCircuit.circuitFunction === 'Intellibrite') {

            // only want to bind once
            // will it rebind of we call the entire function again?  need to destroy?
            if (lightSelectPickerBound === 0) {
                lightSelectPickerBound = 1
                // To style only <select>s with the selectpicker class
                $(el).selectpicker({
                    //mobile: jQuery.browser.mobile, //if true, use mobile native scroll, else format with selectpicker css
                });


                $(el).on('changed.bs.select', function (e, clickedIndex, newValue, oldValue) {

                    //console.log('intellibrite light mode name: %s  val: %s  ', $(el).val(), $(el).find('option:selected').data('val'))

                    socket.emit('setLightMode', $(el).find('option:selected').data('val'))

                    // right now not sure how to ask for the "status" packet so we can't refresh
                    // on the app side by sending a new Emit
                    // $(el).prop('disabled', true)
                    $(el).selectpicker('val', '')
                    $(el).selectpicker('refresh')
                })

            }

            //$(el).selectpicker('val', currCircuit.light.modeStr)

        }

    })
}

function bindLightSwimDelay(el, _default) {
    // To style only <select>s with the selectpicker class
    $(el).selectpicker({
        mobile: jQuery.browser.mobile, //if true, use mobile native scroll, else format with selectpicker css
    });
    $(el).selectpicker('val', _default)
    $(el).on('changed.bs.select', function (e, clickedIndex, newValue, oldValue) {

        //console.log('name: %s  val: %s  circuit: %s', $(el).val(), $(el).find('option:selected').data('val'), $(el).closest('select').data('circuitnum'))

        socket.emit('setLightSwimDelay', $(el).closest('select').data('circuitnum'), $(el).find('option:selected').data('val'))

        $(el).prop('disabled', true)
        $(el).selectpicker('refresh')
    })
}


function bindLightPosition(el, _default) {
    // To style only <select>s with the selectpicker class
    $(el).selectpicker({
        mobile: jQuery.browser.mobile, //if true, use mobile native scroll, else format with selectpicker css
    });
    $(el).selectpicker('val', _default)
    $(el).on('changed.bs.select', function (e, clickedIndex, newValue, oldValue) {

        //console.log('name: %s  val: %s  circuit: %s', $(el).val(), $(el).find('option:selected').data('val'), $(el).closest('select').data('circuitnum'))

        socket.emit('setLightPosition', $(el).closest('select').data('circuitnum'), $(el).val())

        $(el).prop('disabled', true)
        $(el).selectpicker('refresh')
    })
}

function bindLightColorSelectPicker(el, _default) {
    // To style only <select>s with the selectpicker class
    $(el).selectpicker({
        mobile: jQuery.browser.mobile, //if true, use mobile native scroll, else format with selectpicker css
    });
    $(el).selectpicker('val', _default)
    $(el).on('changed.bs.select', function (e, clickedIndex, newValue, oldValue) {

        //console.log('name: %s  val: %s', $(el).val(), $(el).find('option:selected').data('val'))

        socket.emit('setLightColor', $(el).closest('select').data('circuitnum'), $(el).find('option:selected').data('val'))

        $(el).prop('disabled', true)
        $(el).selectpicker('refresh')
    })
}


function bindNotUsedEggTimer() {
    $('#addEggTimerCircuit').selectpicker({
        mobile: jQuery.browser.mobile, //if true, use mobile native scroll, else format with selectpicker css
    });
    $('#addEggTimerCircuit').on('changed.bs.select', function (e, clickedIndex, newValue, oldValue) {
        socket.emit('setSchedule', $('#scheduleIdNotUsed').data('id'), $('#addEggTimerCircuit').find('option:selected').data('circuitnum'), 25, 0, 2, 0, 0)
        //console.log('setSchedule', $('#scheduleIdNotUsed').data('id'), $('#addEggTimerCircuit').find('option:selected').data('circuitnum'),25,0,2,0,0)
        $('#addEggTimerCircuit').prop('disabled', true)
        $('#addEggTimerCircuit').selectpicker('refresh')
    })
}


function bindNotUsedEggTimer() {
    $('#addEggTimerCircuit').selectpicker({
        mobile: jQuery.browser.mobile, //if true, use mobile native scroll, else format with selectpicker css
    });
    $('#addEggTimerCircuit').on('changed.bs.select', function (e, clickedIndex, newValue, oldValue) {
        socket.emit('setSchedule', $('#scheduleIdNotUsed').data('id'), $('#addEggTimerCircuit').find('option:selected').data('circuitnum'), 25, 0, 2, 0, 0)
        //console.log('setSchedule', $('#scheduleIdNotUsed').data('id'), $('#addEggTimerCircuit').find('option:selected').data('circuitnum'),25,0,2,0,0)
        $('#addEggTimerCircuit').prop('disabled', true)
        $('#addEggTimerCircuit').selectpicker('refresh')
    })
}

function buildEggTime(el, currSchedule) {
    buildEditRowEggTimer(el, currSchedule)
    buildStaticRowEggTimer(el, currSchedule)
}


function formatLog(strMessage) {
    // Colorize Message, in HTML format
    var strSplit = strMessage.split(' ');
    if (typeof(logColors) !== "undefined")
        strColor = logColors[strSplit[1].toLowerCase()];
    else
        strColor = "lightgrey";
    if (strColor) {
        strSplit[1] = strSplit[1].fontcolor(strColor).bold();
    }

    // And output colorized string to Debug Log (Panel)
    $('#txtDebug').append(strSplit.join(' ') + '<br>');
    $("#txtDebug").scrollTop($("#txtDebug")[0].scrollHeight);
}

String.prototype.capitalizeFirstLetter = function () {
    return this.charAt(0).toUpperCase() + this.toLowerCase().slice(1);
};

String.prototype.toTitleCase = function () {
    return this.replace(/\w\S*/g, function (txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
};

function pumpManualButtonsEnableDisable(pump, mode) {
    pumpXRunProgram = '#pump' + pump + 'RunProgram'
    pumpXRunDuration = '#pump' + pump + 'RunDuration'
    pumpXProgram = '#pump' + pump + 'Program'
    if (mode === 'enable') {
        if ($(pumpXRunDuration).spinner('instance') !== undefined)
            $(pumpXRunDuration).spinner('enable')

        if ($(pumpXProgram).find('option:selected').data('programid') === undefined) {
            $(pumpXRunProgram).attr('disabled', 'disabled')
        }
        else {
            $(pumpXRunProgram).removeAttr('disabled') // make sure we turn off the button if no running programs
        }
        $(pumpXProgram).parent().children('button').removeAttr('disabled')
        $('#pump' + pump + 'Edit').hide()
        $('#pump' + pump + 'EditResume').hide()
    }
    else {
        if ($(pumpXRunDuration).spinner('instance') !== undefined) {
            $(pumpXRunDuration).spinner('disable')
        }
        $(pumpXRunProgram).attr('disabled', 'disabled')
        $('#pump' + pump + 'Edit').show()
        $('#pump' + pump + 'EditResume').hide()
        $(pumpXProgram).parent().children('button').attr('disabled', 'disabled')
    }
}

function setStatusButton(btnID, btnState, btnLeadingText, glyphicon) {
    // Check for Leading Text
    if (typeof btnLeadingText === "undefined")
        btnLeadingText = '';
    if (typeof glyphicon === "undefined")
        glyphicon = '';
    // Set Button State
    if (btnState === 'delay') {
        btnID.html(btnLeadingText + 'Delay' + glyphicon);
        btnID.removeClass('btn-success');
        btnID.addClass('btn-warning');
    } else if (btnState === 1) {
        btnID.html(btnLeadingText + 'On' + glyphicon);
        btnID.removeClass('btn-primary');
        btnID.removeClass('btn-warning');
        btnID.addClass('btn-success');
    } else {
        btnID.html(btnLeadingText + 'Off' + glyphicon);
        btnID.removeClass('btn-success');
        btnID.addClass('btn-primary');
    }
}

// Function to configure communications sockets receive handling -> not called until clientConfig.json available (i.e. configuration complete)
function startSocketRx() {
    socket.on('circuit', function (data) {
        if (data.hasOwnProperty('circuit')) {
            data = data.circuit
        }
        if (data !== null) {
            currCircuitArr = JSON.parse(JSON.stringify(data))
            // parse circuit data
            $.each(data, function (indx, currCircuit) {
                if (currCircuit.hasOwnProperty('friendlyName')) {
                    // Check for POOL or SPA - then ignore friendlyName, need to use circuitFunction for these two!
                    if ((currCircuit.circuitFunction.toUpperCase() === "POOL") || (currCircuit.circuitFunction.toUpperCase() === "SPA"))
                        currName = currCircuit.circuitFunction.toUpperCase();
                    else
                        currName = currCircuit.friendlyName;
                    if (currName !== "NOT USED") {
                        var glyphicon = '<span class="glyphicon glyphicon-play" aria-hidden="true"></span>';
                        if (document.getElementById(currName)) {

                            setStatusButton($('#' + currName), currCircuit.status);
                            $('#' + currName).data(currName, currCircuit.number);
                        } else if (document.getElementById(currCircuit.numberStr)) {
                            if (currCircuit.delay === 1) {
                                setStatusButton($('#' + currCircuit.numberStr), 'delay', '', currCircuit.macro ? glyphicon : '');
                            } else {
                                setStatusButton($('#' + currCircuit.numberStr), currCircuit.status, '', currCircuit.macro ? glyphicon : '');
                            }
                            $('#' + currCircuit.numberStr).data(currCircuit.numberStr, currCircuit.number);
                        } else if ((appParams.equipment.circuit.hideAux === false) || (currName.indexOf("AUX") === -1)) {
                            $('#features tr:last').after('<tr><td>' + currName.toLowerCase().toTitleCase() + '</td><td><button class="btn btn-primary btn-md" name="' + currCircuit.numberStr + '" id="' + currCircuit.numberStr + '">---</button></td></tr>');
                            if (currCircuit.delay === 1) {
                                setStatusButton($('#' + currCircuit.numberStr), 'delay', '', currCircuit.macro ? glyphicon : '');
                            } else {
                                setStatusButton($('#' + currCircuit.numberStr), currCircuit.status, '', currCircuit.macro ? glyphicon : '');
                            }
                            $('#' + currCircuit.numberStr).data(currCircuit.numberStr, currCircuit.number);
                        }
                    }
                }
            });

            // parse light data
            insertLightEdit()
        }
        // do only once for all circuits
        bindLightSelectPicker()
        lastUpdate(true);
    });


    socket.on('pump', function (data) {
        if (data.hasOwnProperty('pump')) {
            data = data.pump
        }

        // reset virtualPumpController Header
        $('#virtualPumpController thead tr').html($('<th/>', {html: 'Parameter'}))

        if (data !== null) {
            // check all pumps first to see if we need to hide the GPM row
            var showGPM = false;

            // Build Pump table / panel
            $.each(data, function (indx, currPump) {
                if (currPump === null || currPump['type'] === "None") {
                    showHideVirtualPumpCol = ".virtualPump" + currPump["pump"]
                    $(showHideVirtualPumpCol).hide()
                    //console.log("Pump: Dataset empty.")
                } else {
                    if (currPump !== "blank") {

                        // append virtual pump controller friendlyname + programs
                        if (currPump.virtualController === 'disabled') {
                            $('#pumpEdit, .pumpEdit').hide()
                        }
                        else {
                            $('#pumpEdit, .pumpEdit').show()
                            $('#virtualPumpController thead tr').append($('<th/>', {
                                html: currPump["friendlyName"],
                                //html: 'blah!!!',
                                "data-id": currPump["pump"]
                            }))
                            showHideVirtualPumpCol = ".virtualPump" + currPump["pump"]
                            $(showHideVirtualPumpCol).show()

                            //$('#virtualPumpController tbody tr td:eq(' + currPump["pump"] + ')').replaceWith($('<td/>', {html:currPump["type"], "data-id":currPump["pump"]}))

                            $('#pumpType[data-pumpid="' + currPump["pump"] + '"]').selectpicker('val', currPump["type"])


                            if (currPump["type"] === "VS") {
                                $('#virtualPumpController').find('.virtualPumpSpeedType[data-pumpid="' + currPump['pump'] + '"]').css('display', 'none')
                                $('#virtualPumpController').find('span.gpm[data-pumpid="' + currPump['pump'] + '"]').css('display', 'none')
                                $('#virtualPumpController').find('span.rpm[data-pumpid="' + currPump['pump'] + '"]').css('display', '')
                            }
                            else if (currPump["type"] === "VF") {
                                $('#virtualPumpController').find('.virtualPumpSpeedType[data-pumpid="' + currPump['pump'] + '"]').css('display', 'none')
                                $('#virtualPumpController').find('span.gpm[data-pumpid="' + currPump['pump'] + '"]').css('display', '')
                                $('#virtualPumpController').find('span.rpm[data-pumpid="' + currPump['pump'] + '"]').css('display', 'none')
                            }
                            else if (currPump["type"] === "None") {
                                $('#virtualPumpController').find('span.gpm[data-pumpid="' + currPump['pump'] + '"]').css('display', 'none')
                                $('#virtualPumpController').find('span.rpm[data-pumpid="' + currPump['pump'] + '"]').css('display', 'none')
                                $('#virtualPumpController').find('.virtualPumpSpeedType[data-pumpid="' + currPump['pump'] + '"]').css('display', 'none')
                            }
                            else if (currPump["type"] === "VSF") {
                                $('#virtualPumpController').find('span.gpm[data-pumpid="' + currPump['pump'] + '"]').css('display', 'none')
                                $('#virtualPumpController').find('span.rpm[data-pumpid="' + currPump['pump'] + '"]').css('display', 'none')
                                $('#virtualPumpController').find('.virtualPumpSpeedType[data-pumpid="' + currPump['pump'] + '"]').css('display', '')
                            }


                            var pumpXProgram = '#pump' + currPump['pump'] + 'Program'
                            var speedType;


                            //console.log('pump: %s  edit.is(\':visible\'):%s  .mode!==:%s .value!==:%s  all: %s', currPump['pump'], $('#pump'+currPump['pump']+'Edit').is(':visible'), prevPumpMode[currPump['pump']].mode!==currPump.currentrunning.mode, prevPumpMode[currPump['pump']].value!==currPump.currentrunning.value, $('#pump'+currPump['pump']+'Edit').is(':visible') || prevPumpMode[currPump['pump']].mode!==currPump.currentrunning.mode || prevPumpMode[currPump['pump']].value!==currPump.currentrunning.value)
                            // only update the pump values if we are not editing while the current program is running, or while there is not a change in states
                            if ($('#pump' + currPump['pump'] + 'Edit').is(':visible') || prevPumpMode[currPump['pump']].mode !== currPump.currentrunning.mode || prevPumpMode[currPump['pump']].value !== currPump.currentrunning.value) {

                                // update edit params in modal edit page
                                $.each(currPump["externalProgram"], function (extPrgIndx, currPrg) {
                                    // this check is for VSF pumps.
                                    var speedType = ''
                                    if (currPump["type"] === 'VSF') {
                                        if (currPrg < 150) {
                                            speedType = 'gpm'
                                        }
                                        else {
                                            speedType = 'rpm'
                                        }
                                        var vpSpeedType = $('.virtualPumpSpeedType[data-pumpid=' + currPump["pump"] + '][data-speedtype="' + speedType + '"][data-program=' + extPrgIndx + ']')
                                        vpSpeedType.addClass('btn-primary').siblings().removeClass('btn-primary')
                                    }
                                    else if (currPump["type"] === 'VF') {
                                        speedType = 'gpm'
                                        if (currPrg > 150 || currPrg < 15) {
                                            currPrg = 30 // set to default value that is valid
                                            socket.emit('setPumpProgramSpeed', currPump["pump"], extPrgIndx, 30)
                                        }
                                    }
                                    else if (currPump["type"] === 'VS') {
                                        speedType = 'rpm'
                                        if (currPrg > 3450 || currPrg < 450) {
                                            currPrg = 1000 // set to default value that is valid
                                            socket.emit('setPumpProgramSpeed', currPump["pump"], extPrgIndx, 1000)
                                        }
                                    }
                                    var vpSpeed = '.virtualPumpSpeed[data-pumpid="' + currPump["pump"] + '"][data-program="' + extPrgIndx + '"]'
                                    updateVirtualPumpSpinner(vpSpeed, currPrg)
                                    // end updates for modal edit page

                                    // start updates for virtual pump controller in main Pumps panel
                                    // if we are here and it's the first index, remove all previous options and rebuild in "select a program"
                                    if (parseInt(extPrgIndx) === 1) { // && !(prevPumpMode[currPump['pump']].value==='program' && currPump.currentrunning.value==='off')) {
                                        $(pumpXProgram).find('option').remove()
                                        $(pumpXProgram).append($('<option/>', {text: 'Program'}))
                                        $('#pump' + currPump['pump'] + 'RunProgram').attr('disabled', 'disabled')
                                    }

                                    // build string for current programs; append to options
                                    thisPrg = extPrgIndx + ': ' + currPrg + ' ' + speedType
                                    $(pumpXProgram).append($('<option/>', {
                                        "data-programid": extPrgIndx,
                                        "data-pumpid": currPump["pump"],
                                        text: thisPrg
                                    }))
                                    $(pumpXProgram).selectpicker('refresh')

                                    thisPrg = currPump.currentrunning.value + ': ' + currPump.externalProgram[currPump.currentrunning.value] + ' ' + speedType
                                    // if (prevPumpMode[currPump['pump']].value!==currPump.currentrunning.value){
                                    $(pumpXProgram).selectpicker('val', thisPrg)
                                    $(pumpXProgram).selectpicker('refresh')
                                    //}
                                })
                                // if the current extPrgIndx is the current running program, set the values in 'select a program' and duration
                                pumpXRunProgram = '#pump' + currPump['pump'] + 'RunProgram'
                                pumpXRunDuration = '#pump' + currPump['pump'] + 'RunDuration'
                                if (currPump.currentrunning.mode === 'off') {
                                    $(pumpXRunProgram).removeClass('btn-success')
                                    pumpManualButtonsEnableDisable(currPump['pump'], 'enable')
                                    $('#pump' + currPump['pump'] + 'StopProgram').hide() //.attr('disabled', 'disabled')

                                } else {
                                    if (currPump.externalProgram[currPump.currentrunning.value] < 150)
                                        speedType = 'gpm'
                                    else
                                        speedType = 'rpm'

                                    remainingduration = Math.ceil(parseInt(currPump.currentrunning.remainingduration))

                                    if ($(pumpXRunDuration).spinner('instance') !== undefined) {
                                        $(pumpXRunDuration).spinner('value', remainingduration)
                                    }
                                    $(pumpXRunProgram).addClass('btn-success')
                                    pumpManualButtonsEnableDisable(currPump['pump'], 'disable')
                                    $('#pump' + currPump['pump'] + 'StopProgram').show() //.removeAttr('disabled')

                                }

                            }
                        }
                        prevPumpMode[currPump['pump']].mode = currPump.currentrunning.mode
                        prevPumpMode[currPump['pump']].value = currPump.currentrunning.value
                        $('#pumpProgram1, #pumpProgram2').selectpicker({
                            mobile: jQuery.browser.mobile, //if true, use mobile native scroll, else format with selectpicker css
                        })
                        $('#pumpProgram1, #pumpProgram2').selectpicker('refresh');

                        // end virtual pump controller edits

                        if (currPump['type'].toUpperCase() === 'VF') {
                            showGPM = true;
                        }
                        // New Pump Data (Object) ... make sure pumpParams has been read / processed (i.e. is available)
                        if (typeof(pumpParams) !== "undefined") {
                            if (typeof(currPump["friendlyName"]) !== "undefined") {
                                // Determine if we need to add a column (new pump), or replace data - and find the target column if needed
                                var rowHeader = $('#pumps tr:first:contains(' + currPump["friendlyName"] + ')');

                                var colAppend = rowHeader.length ? false : true;
                                //console.log('currPump["friendlyName"]: ', currPump["friendlyName"])
                                if (colAppend === false) {
                                    var colTarget = -1;
                                    $('th', rowHeader).each(function (index) {
                                        if ($(this).text() === currPump["friendlyName"])
                                            colTarget = index;
                                    });
                                }

                                if (!showGPM) {
                                    $('#pumps tr:contains("GPM")').attr("hidden", "hidden")
                                }

                                // Cycle through Pump Parameters
                                for (var currPumpParam in pumpParams) {
                                    currParamSet = pumpParams[currPumpParam];
                                    // Find Target Row
                                    var rowTarget = $('#pumps tr:contains("' + currParamSet["title"] + '")');
                                    // And finally, append or replace data
                                    if (colAppend === true) {
                                        // Build Cell, Append
                                        strCell = '<' + currParamSet["type"] + '>' + currPump[currPumpParam] + '</' + currParamSet["type"] + '>';
                                        rowTarget.append(strCell);
                                    } else {
                                        // Replace Data, target Row, Column
                                        $('td', rowTarget).each(function (index) {
                                            if (index === colTarget)
                                                $(this).html(currPump[currPumpParam]);
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            });
        }
        lastUpdate(true);
    });


    socket.on('intellichem', function (data) {
            if (appParams.equipment.intellichem.installed) {
                if (data.hasOwnProperty('intellichem')) {
                    data = data.intellichem


                    //rebuild table
                    $('#intellichemTable').html('<thead>' +
                        '<th>' +
                        '<td>SI</td>' +
                        '</th>' +
                        '<tr>' +
                        '<th>Parameter</th>' +
                        '<th>pH</th>' +
                        '<th>ORP</th>' +
                        '</tr>' +
                        '</thead>' +
                        '<tbody>' +
                        '' +
                        '<tr>' +
                        '<td>Reading</td>' +
                        '</tr>' +
                        '<tr>' +
                        '<td>Setpoint</td>' +
                        '' +
                        '</tr>' +
                        '<tr>' +
                        '<td>Tank Level</td>' +
                        '</tr>' +
                        '<tr>' +
                        '<td>Mode</td>' +
                        '</tr>' +
                        '<tr>' +
                        '<td>Water Flow Alarm</td>' +
                        '</tr>' +
                        '<thead>' +
                        '<tr>' +
                        '<td>Calcium Hardness</td>' +
                        '</tr>' +
                        '<tr>' +
                        '<td>Total Alkalinity</td>' +
                        '</tr>' +
                        '<tr>' +
                        '<td>CYA</td>' +
                        '</tr>' +
                        '</tbody>')

                    // console.log('received intellichem:', data)
                    $('#intellichemTable tr td:contains("SI")').after($('<td/>', {text: data.readings.ORP}))
                    $('#intellichemTable tr td:contains("Reading")').after($('<td/>', {text: data.readings.ORP})).after($('<td/>', {text: data.readings.PH}))
                    $('#intellichemTable tr td:contains("Setpoint")')
                        .after($('<td/>')
                            .append($('<button/>', {
                                    id: 'ORPMinusOne',
                                    class: "btn btn-primary btn-md",
                                    "data-socket": "decrementORP"
                                })
                                    .append($('<span/>', {style: "font-weight:bold; font-size:12px;", html: '&#x21E9;'}))
                            )
                            .append($('<span/>', {text: data.settings.ORP}))
                            .append($('<button/>', {
                                    id: 'ORPPlusOne',
                                    class: "btn btn-primary btn-md",
                                    "data-socket": "incrementORP"
                                })
                                    .append($('<span/>', {style: "font-weight:bold; font-size:12px;", html: '&#x21E7'}))
                            )
                        )


                    $('#intellichemTable tr td:contains("Setpoint")')
                        .after($('<td/>')
                            .append($('<button/>', {
                                    id: 'pHMinusOne',
                                    class: "btn btn-primary btn-md",
                                    "data-socket": "decrementPH"
                                })
                                    .append($('<span/>', {style: "font-weight:bold; font-size:12px;", html: '&#x21E9;'}))
                            )
                            .append($('<span/>', {text: data.settings.PH}))
                            .append($('<button/>', {
                                    id: 'pHPlusOne',
                                    class: "btn btn-primary btn-md",
                                    "data-socket": "incrementPH"
                                })
                                    .append($('<span/>', {style: "font-weight:bold; font-size:12px;", html: '&#x21E7'}))
                            )
                        )


                    $('#intellichemTable tr td:contains("Tank Level")')
                        .after($('<td/>', {text: data.tankLevels[2] + '/6'})).after($('<td/>', {text: data.tankLevels[1] + '/6'}))
                    $('#intellichemTable tr td:contains("Water Flow Alarm")').after($('<td/>', {html: "&nbsp;"})).after($('<td/>', {text: data.readings.WATERFLOW}))
                    $('#intellichemTable tr td:contains("CYA")')
                        .after($('<td/>', {colspan: 2})
                            .append($('<button/>', {
                                    id: 'CYAMinusOne',
                                    class: "btn btn-primary btn-md",
                                    "data-socket": "decrementCYA"
                                })
                                    .append($('<span/>', {style: "font-weight:bold; font-size:12px;", html: '&#x21E9;'}))
                            )
                            .append($('<span/>', {text: data.settings.CYA}))
                            .append($('<button/>', {
                                    id: 'CYAPlusOne',
                                    class: "btn btn-primary btn-md",
                                    "data-socket": "incrementCYA"
                                })
                                    .append($('<span/>', {style: "font-weight:bold; font-size:12px;", html: '&#x21E7'}))
                            )
                        )
                    $('#intellichemTable tr td:contains("Calcium Hardness")')
                        .after($('<td/>', {colspan: 2})
                            .append($('<button/>', {
                                    id: 'CHMinusOne',
                                    class: "btn btn-primary btn-md",
                                    "data-socket": "decrementCH"
                                })
                                    .append($('<span/>', {style: "font-weight:bold; font-size:12px;", html: '&#x21E9;'}))
                            )
                            .append($('<span/>', {text: data.settings.CALCIUMHARDNESS}))
                            .append($('<button/>', {
                                    id: 'CHPlusOne',
                                    class: "btn btn-primary btn-md",
                                    "data-socket": "incrementCH"
                                })
                                    .append($('<span/>', {style: "font-weight:bold; font-size:12px;", html: '&#x21E7'}))
                            )
                        )

                    $('#intellichemTable tr td:contains("Total Alkalinity")')
                        .after($('<td/>', {colspan: 2})
                            .append($('<button/>', {
                                    id: 'TAMinusOne',
                                    class: "btn btn-primary btn-md",
                                    "data-socket": "decrementTA"
                                })
                                    .append($('<span/>', {style: "font-weight:bold; font-size:12px;", html: '&#x21E9;'}))
                            )
                            .append($('<span/>', {text: data.settings.TOTALALKALINITY}))
                            .append($('<button/>', {
                                    id: 'TAPlusOne',
                                    class: "btn btn-primary btn-md",
                                    "data-socket": "incrementTA"
                                })
                                    .append($('<span/>', {style: "font-weight:bold; font-size:12px;", html: '&#x21E7'}))
                            )
                        )

                    $('#intellichemTable tr td:contains("Mode")').after($('<td/>', {text: data.mode[2]})).after($('<td/>', {text: data.mode[1]}))
                }
                else {
                    console.log("No intellichem data received.")
                }
            }
            else {
                //$('#hidePanelintellichem').click()
                //console.log('Hid intellichem because it is not installed')
            }
            lastUpdate(true);
        }
    );

    socket.on('temperature', function (data) {
        if (data.hasOwnProperty('temperature')) {
            data = data.temperature
        }
        $('#airTemp').html(data.airTemp);
        $('#solarTemp').html(data.solarTemp);
        if (data.solarTemp === 0)
            $('#solarTemp').closest('tr').hide();
        else
            $('#solarTemp').closest('tr').show();
        $('#poolCurrentTemp').html(data.poolTemp);
        $('#spaCurrentTemp').html(data.spaTemp);
        if (data.heaterActive === 1)
            $('#stateHeater').html('On');
        else
            $('#stateHeater').html('Off');
        if (data.freeze === 1)
            $('#stateFreeze').html('On');
        else
            $('#stateFreeze').html('Off');
        $('#poolHeatSetPoint').html(data.poolSetPoint);
        $('#poolHeatMode').data('poolHeatMode', data.poolHeatMode);
        $('#poolHeatModeStr').html(data.poolHeatModeStr);
        $('#spaHeatSetPoint').html(data.spaSetPoint);
        $('#spaHeatMode').data('spaHeatMode', data.spaHeatMode);
        $('#spaHeatModeStr').html(data.spaHeatModeStr);
        lastUpdate(true);
    });
// socket.on('heat', function(data) {
//     if (data !== null) {
//         $('#poolHeatSetPoint').html(data.poolSetPoint);
//         $('#poolHeatMode').data('poolHeatMode', data.poolHeatMode);
//         $('#poolHeatModeStr').html(data.poolHeatModeStr);
//         $('#spaHeatSetPoint').html(data.spaSetPoint);
//         $('#spaHeatMode').data('spaHeatMode', data.spaHeatMode);
//         $('#spaHeatModeStr').html(data.spaHeatModeStr);
//     }
//     lastUpdate(true);
// });

    socket.on('chlorinator', function (data) {
        if (data.hasOwnProperty('chlorinator')) {
            data = data.chlorinator
        }
        //var data = {"saltPPM":2900,"currentOutput": 12, "outputPoolPercent":7,"outputSpaPercent":-1,"superChlorinate":0,"version":0,"name":"Intellichlor--40","status":"Unknown - Status code: 128"};
        if (data !== null) {

            if (data.installed === 1) {
                $('#chlorinatorTable tr').not(':first').show();
                $('#chlorinatorInstalled').hide();

                if ((data.currentOutput > 0))
                    setStatusButton($('#CHLORINATOR'), 1, data.superChlorinate===1?'Super Chlorinate - ':'');
                else
                    setStatusButton($('#CHLORINATOR'), 0);
                $('#chlorinatorName').html(data.name);
                $('#chlorinatorSalt').html(data.saltPPM + ' ppm');
                $('#chlorinatorCurrentOutput').html(data.currentOutput + '%');
                var chlorStr = data.outputPoolPercent + '%'
                if (data.outputSpaPercent === -1) {
                    $('#chlorinatorPoolPercentLabel').html('Pool Setpoint')
                } else {
                    chlorStr += ' / ' + data.outputSpaPercent + '%';
                    $('#chlorinatorPoolPercentLabel').html('Pool/Spa Setpoint')
                }

                $('#chlorinatorPoolPercent').html(chlorStr);

                if (data.superChlorinate === 1)
                    $('#chlorinatorSuperChlorinate').html('<b>True - ' + data.superChlorinateHours + ' hours</b>').css('color', "green");
                else
                    $('#chlorinatorSuperChlorinate').html('False').css("color", "black");
                $('#chlorinatorStatus').html(data.status);
                $('#chlorinatorControlledBy').html(data.controlledBy)
                $('#modalChlorInputPool').val(data.outputPoolPercent)
                $('#modalChlorInputSpa').val(data.outputSpaPercent)
                $('#modalChlorInputSuperChlor').val(data.superChlorinateHours)
                if (data.controlledBy==='intellicom' || data.controlledBy==='virtual'){
                    $('#modalChlorInputSpaGrp').hide()
                    $('#modalChlorInputSuperChlorGrp').hide()
                }
                $('#chlorEdit').show()

            } else {
                $('#chlorinatorTable tr').not(':first').hide();
                $('#chlorinatorInstalled').show();
                $('#modalChlorInputSuperChlorGrp').show();
                $('#chlorEdit').hide()
            }
        }
        lastUpdate(true);
    });

    socket.on('schedule', function (data) {
        if (data.hasOwnProperty('schedule')) {
            data = data.schedule
        }
        if (data !== null) {
            // Schedule/EggTimer to be updated => Wipe, then (Re)Build Below
            $('#schedules tr').not('tr:first').remove();
            $('#eggtimers tr').not('tr:first').remove();

            var idOfFirstNotUsed = -1

            // And (Re)Build Schedule and EggTimer tables / panels
            $.each(data, function (indx, currSchedule) {
                if (currSchedule === null) {
                    //console.log("Schedule: Dataset empty.")
                } else {
                    if (currSchedule !== "blank") {

                        // Schedule Event (if circuit used)
                        if (currSchedule.CIRCUIT !== 'NOT USED') {
                            if (currSchedule.MODE === "Schedule") {
                                buildSchTime('#schedules', currSchedule)
                            } else {
                                // EggTimer Event (if circuit used)
                                buildEggTime('#eggtimer', currSchedule)
                            }
                        } else {
                            if (idOfFirstNotUsed === -1) {
                                idOfFirstNotUsed = currSchedule.ID
                            }
                        }
                    }
                }
            });
            if (idOfFirstNotUsed !== -1) {
                insertAddSchedule(data[idOfFirstNotUsed], idOfFirstNotUsed)
                insertAddEggTimer(data[idOfFirstNotUsed], idOfFirstNotUsed)
            }

            //enable all popovers and tooltips
            $('[data-toggle="popover"]').popover({trigger: "hover click", html: true, container: 'body'});
            $('[data-toggle="tooltip"]').tooltip()
        }

        lastUpdate(true);
    });

    socket.on('outputLog', function (data) {
        formatLog(data);
        lastUpdate(true);
    });

    socket.on('time', function (data) {
        if (data.hasOwnProperty('time')) {
            data = data.time
        }
        // Update Date and Time (buttons) - custom formatted
        var newDT = new Date(data.controllerDateStr + ' ' + data.controllerTime)
        $('#currDate').val(newDT.getDate() + '-' + monthOfYearAsString(newDT.getMonth()) + '-' + newDT.getFullYear().toString().slice(-2));
        $('#currTime').val(fmt12hrTime(newDT.getHours() + ':' + newDT.getMinutes()));
        // Initialize (and configure) Date and Clock Pickers for button (input) => gated on getting time once, to determine DST setting!
        autoDST = data.automaticallyAdjustDST;
        $('#currDate').datepicker({
            dateFormat: 'dd-M-y',
            onSelect: function () {
                var newDT = new Date($('#currDate').val() + ' ' + $('#currTime').val());
                socket.emit('setDateTime', newDT.getHours(), newDT.getMinutes(), Math.pow(2, newDT.getDay()), newDT.getDate(), newDT.getMonth() + 1, newDT.getFullYear().toString().slice(-2), autoDST);
            }
        });
        $('#currTime').clockpicker({
            donetext: 'OK',
            twelvehour: false,
            beforeShow: function () {
                $('#currTime').val(fmt24hrTime($('#currTime').val()));
            },
            afterShow: function () {
                $('#currTime').val(fmt12hrTime($('#currTime').val()));
            },
            afterHide: function () {
                $('#currTime').val(fmt12hrTime($('#currTime').val()));
            },
            afterDone: function () {
                $('#currTime').val(fmt12hrTime($('#currTime').val()));
                var newDT = new Date($('#currDate').val() + ' ' + $('#currTime').val());
                socket.emit('setDateTime', newDT.getHours(), newDT.getMinutes(), Math.pow(2, newDT.getDay()), newDT.getDate(), newDT.getMonth() + 1, newDT.getFullYear().toString().slice(-2), autoDST);
            }
        });

        socket.on('connect', function () {
            // won't fire on initial connect (timing issue?), but will fire on any subsequent reconnects
            //console.log('Socket.IO connection ID:', socket.id)
        })
        socket.on('connection_timeout', function (timeout) {
            console.log('Socket.IO connection timeout:', timeout)
        })
        socket.on('reconnect_attempt', function () {
            console.log('Socket.IO is attempting to reconnect to the server')
        })
        socket.on('reconnect', function (attempt) {
            console.log('Socket.IO successfully reconnected after %s attempts ', attempt)
        })
        socket.on('disconnect', function () {
            console.log('Socket.IO received a disconnect from the server')
        })

        lastUpdate(true);
    });

    socket.on('updateAvailable', function (data) {
        strUpdate = data.result.capitalizeFirstLetter()
        domUpdate = $('#gitState')
        domUpdate[0].innerHTML = 'Code State<br/>' + strUpdate;
        if (strUpdate === 'Equal') {
            domUpdate.removeClass('btn-warning');
            domUpdate.removeClass('btn-danger');
            domUpdate.addClass('btn-success');
        } else if (strUpdate === 'Newer') {
            domUpdate.removeClass('btn-success');
            domUpdate.removeClass('btn-danger');
            domUpdate.addClass('btn-warning');
        } else {
            domUpdate.removeClass('btn-success');
            domUpdate.removeClass('btn-warning');
            domUpdate.addClass('btn-danger');
        }
        domUpdate[0].style.visibility = "visible";
        lastUpdate(true);
    });
}

// Socket Emit Events (Transmit to Server)

function setHeatMode(equip, change) {
    socket.emit('setHeatMode', equip, change);
}

function setEquipmentStatus(equipment) {
    if (equipment !== undefined)
        socket.emit('toggleCircuit', equipment);
    else
        formatLog('ERROR: Client, equipment = undefined');
}


function refreshSpy() {
    $('[data-spy="scroll"]').each(function () {
        var $spy = $(this).scrollspy('refresh')
    })
}

// Initialize Panel Handling Routines (Callbacks)
function handlePanels() {
    // Panel Handling: When Panel is being collapsed or shown => save current state to configClient.json (i.e. set to be the default on load)
    $(".panel-collapse").on('show.bs.collapse', function (btnSelected) {
        var btnID = btnSelected.target.id;
        var strID = btnID.replace('collapse', '').toLowerCase();
        socket.emit('setConfigClient', 'panelState', strID, 'state', 'visible')
        refreshSpy();
    });
    $(".panel-collapse").on('hide.bs.collapse', function (btnSelected) {
        var btnID = btnSelected.target.id;
        var strID = btnID.replace('collapse', '').toLowerCase();
        socket.emit('setConfigClient', 'panelState', strID, 'state', 'collapse')
        refreshSpy();
    });
}

// Initialize Button Handling Routines (Callbacks)
function handleButtons() {

    // Button Handling: gitState => Hide Code State (and flag upstream). Note, hidden to start (default, in index.html), unhide (change visibility) if state received.
    $('#gitState').click(function () {
        $('#gitState')[0].style.visibility = "hidden";
        socket.emit('updateVersionNotificationAsync', true);
    });

    // Button Handling: Hide Panel, and Store / Update Config (so hidden permanently, unless reset!)
    $('button').click(function (btnSelected) {
        var btnID = btnSelected.target.id;
        // If Panel Hide selected => then do it!
        if (btnID.search('hidePanel') === 0) {
            var strID = btnID.replace('hidePanel', '');
            $('#' + strID).hide();
            socket.emit('setConfigClient', 'panelState', strID, 'state', 'hidden')
        }
        refreshSpy();
    });

    // Schedule day toggle: bind to the parent event as the children are dynamically created
    $('#schedules').on('click', '.scheduleDays', function () {
        socket.emit('toggleScheduleDay', this.getAttribute("data-schId"), $(this).html())
    })

    // Button Handling: Reset Button Layout (reset all panels in configClient.json to visible)
    $('#btnResetLayout').click(function () {
        socket.emit('updateVersionNotificationAsync', false);
        $.getJSON('configClient.json', function (json) {
            // Panel Data Retrieved, now reset all of them to visible (store to configClient.json, and make visible immediately)
            for (var currPanel in json.panelState) {
             //   socket.emit('setConfigClient', 'panelState', currPanel, 'state', 'visible')
                $('#' + currPanel).show();
            }
            socket.emit('resetConfigClient');

        });
        refreshSpy();
    });

    // Button Handling: Pool, Spa => On/Off
    $('#poolState, #spaState').on('click', 'button', function () {
        setEquipmentStatus($(this).data($(this).attr('id')));
    });

    // Button Handling: Pool / Spa, Temperature SetPoint
    $('#poolSetpoint, #spaSetpoint').on('click', 'button', function () {
        socket.emit($(this).data('socket'), $(this).data('adjust'));
    });


    // Button Handling: Pool / Spa, Heater Mode
    $('#poolHeatMode, #spaHeatMode').on('click', 'button', function () {
        var currButtonPressed = $(this).attr('id');
        if (currButtonPressed.includes('HeatMode')) {
            var strHeatMode = currButtonPressed.slice(0, currButtonPressed.indexOf('HeatMode')) + 'HeatMode';
            var currHeatMode = $('#' + strHeatMode).data(strHeatMode);
            var newHeatMode = (currHeatMode + 4 + $(this).data('heatModeDirn')) % 4;
            setHeatMode($('#' + strHeatMode).data('equip'), newHeatMode);
        }
    });

    // Button Handling: Features => On/Off
    $('#features').on('click', 'button', function () {

        if ($(this).html() === 'Delay') {
            socket.emit('cancelDelay')
        } else {
            setEquipmentStatus($(this).data($(this).attr('id')));
        }
    });

    // Button Handling: Debug Log => On/Off
    $('#debugEnable').click(function () {
        if ($('#debug').is(":visible") === true) {
            $('#debug').hide();
            setStatusButton($('#debugEnable'), 0, 'Debug:<br/>');
            socket.emit('setConfigClient', 'panelState', 'debug', 'state', 'hidden')
        } else {
            $('#debug').show();
            setStatusButton($('#debugEnable'), 1, 'Debug:<br/>');
            socket.emit('setConfigClient', 'panelState', 'debug', 'state', 'visible')
        }
    });

    // Debug Log, KeyPress => Select All (for copy and paste, select log window, press SHFT-A)
    // Reference, from https://www.sanwebe.com/2014/04/select-all-text-in-element-on-click => Remove "older ie".
    $('#txtDebug').keypress(function (event) {
        if (event.key === "A") {
            var sel, range;
            var el = $(this)[0];
            sel = window.getSelection();
            if (sel.toString() === '') { //no text selection
                window.setTimeout(function () {
                    range = document.createRange(); //range object
                    range.selectNodeContents(el); //sets Range
                    sel.removeAllRanges(); //remove all ranges from selection
                    sel.addRange(range); //add Range to a Selection.
                }, 1);
            }
        }
    });

    // Button Handling: Debug Log => Clear!
    $('#debugClear').click(function () {
        $('#txtDebug').html('<b>DEBUG LOG ... <br />');
    });

    // Button Handling: Modal, Save Settings for Chlorinator ... and second function, so keypress (Enter Key) fires input
    $('#SaveChanges').click(function () {
        console.log('savechanges clicked')

        var chlorSettingPool = parseFloat($('#modalChlorInputPool').val());
        var chlorSettingSpa = $('#modalChlorInputSpaGrp').is(":visible")?parseFloat($('#modalChlorInputSpa').val()):-1;
        var chlorSettingSuperChlor = $('#modalChlorInputSuperChlorGrp').is(":visible")?parseFloat($('#modalChlorInputSuperChlor').val()):-1
        console.log('chlorSettingPool: ', chlorSettingPool)
        console.log('is spa visible?: ', $('#modalChlorInputSpaGrp').is(":visible") )

        if ((chlorSettingPool >= 0) && (chlorSettingPool <= 101)) {
            console.log('EMITTING Chlor: %s', chlorSettingPool, chlorSettingSpa, chlorSettingSuperChlor)
            socket.emit('setchlorinator', chlorSettingPool, chlorSettingSpa, chlorSettingSuperChlor);
        }
        else {
            console.log('Invalid chlorinator setting(s): Pool - %s.  Spa - %s', chlorSettingPool, chlorSettingSpa)
        }
        $('#modalChlorinator').modal('hide');
    });

    $('#modalChlorinator').on('keypress',function (key) {
        if (key.which === 13)
            $('#SaveChanges').click();
    })

    //set active menu item
    $(".nav li").on("click", function () {
        $(".nav li").removeClass("active");
        $(this).addClass("active");
    });
    //and collapse navbar when selecting
    $('.navbar-collapse a').click(function () {
        $(".navbar-collapse").collapse('hide');
    });

    $('#editPanelschedule').click(function () {
        if ($('#editPanelschedule').hasClass('btn-success'))
        // static
        {
            $('#editPanelschedule').removeClass('btn-success')
            $('.schEdit').hide()
            $('.schStatic').show()
            $('#schedule').css('display', '')
            $('.scheduleDays').addClass('btn-schDays-Static')
            $('.scheduleDays').prop('disabled', true)
        } else
        // edit
        {
            $('#editPanelschedule').addClass('btn-success')
            $('.schEdit').show()
            $('.schStatic').hide()
            $('#schedule').css('display', 'table')
            $('.scheduleDays').removeClass('btn-schDays-Static')
            $('.scheduleDays').prop('disabled', false)
        }

    })

    $('#editPaneleggtimer').click(function () {
        if ($('#editPaneleggtimer').hasClass('btn-success'))
        // static
        {
            $('#editPaneleggtimer').removeClass('btn-success')
            $('.eggEdit').hide()
            $('.eggStatic').show()
            $('#eggtimer').css('display', '')  //TODO: with short widths, this will extend the size of the box.  but with wide widths, it will make it only as small as it needs to be.  Leaving this tag on all the time has the opposite effect.  (EG when screen is 860px wide vs 1100px
        } else
        // edit
        {
            $('#editPaneleggtimer').addClass('btn-success')
            $('.eggEdit').show()
            $('.eggStatic').hide()
            $('#eggtimer').css('display', 'table')
        }

    })
    $('#editPanelLight').click(function () {
        if ($('#editPanelLight').hasClass('btn-success'))
        // static
        {
            $('#editPanelLight').removeClass('btn-success')
            $('.lightEdit').hide()
            $('#collapseLight').show()
            $('#light').css('display', '')

        } else
        // edit
        {
            $('#editPanelLight').addClass('btn-success')
            $('.lightEdit').show()
            $('#collapseLight').hide()
            $('#light').css('display', 'table')

        }

    })


    $('#pump1StopProgram, #pump2StopProgram').click(function () {
        // console.log('run button %s %s clicked. values %s %s', $(this).data("pumpid"), $(this).text(), $('#pump' +$(this).data('pumpid') + 'RunDuration').spinner('value'), $('#pump' + $(this).data('pumpid') + 'Program').find('option:selected').data('programid'))
        socket.emit('pumpCommandOff', $(this).data("pumpid"))
    })

    $('#pump1RunProgram, #pump2RunProgram').click(function () {
        // console.log('run button %s %s clicked. values %s %s', $(this).data("pumpid"), $(this).text(), $('#pump' +$(this).data('pumpid') + 'RunDuration').spinner('value'), $('#pump' + $(this).data('pumpid') + 'Program').find('option:selected').data('programid'))
        socket.emit('pumpCommandRunProgram', $(this).data("pumpid"), $('#pump' + $(this).data('pumpid') + 'Program').find('option:selected').data('programid'), $('#pump' + $(this).data('pumpid') + 'RunDuration').spinner('value'))
    })

    $('#pump1Program, #pump2Program').on('changed.bs.select', function () {

        if ($('#pump' + $(this).data('pumpid') + 'Program').find('option:selected').data('programid') === undefined) {
            $('#pump' + $(this).data('pumpid') + 'RunProgram').attr('disabled', 'disabled')
        }
        else {
            $('#pump' + $(this).data('pumpid') + 'RunProgram').removeAttr('disabled')

        }

    })

    // mock Globalize numberFormat for mins and secs using jQuery spinner ...
    if (!window.Globalize) window.Globalize = {
        format: function (number, format) {
            if (number === -1)
                return "Manual"
            number = String(this.parseFloat(number, 10) * 1);
            if (number < 60) {
                hours = '00'
            }
            else {
                hours = Math.floor(number / 60)
                if (hours < 10)
                    hours = '0' + hours
            }
            mins = number - parseInt(hours) * 60//number % 60
            if (mins < 10)
                mins = '0' + mins
            number = hours + ':' + mins
            return number;
        },
        parseFloat: function (number, radix) {
            if (number === 'Manual')
                return -1
            else if (typeof number === 'number' || number === undefined) {
                return number
            }
            else {
                splitInpStr = number.split(":");
                number = (parseInt(splitInpStr[0] * 60)) + parseInt(splitInpStr[1])
                return parseFloat(number, radix || 10);
            }
        }
    };

    $("#pump1RunDuration, #pump2RunDuration").spinner({
        step: 1,
        page: 15,
        min: -1,
        max: 4320,
        numberFormat: 'HHmm',
        value: '00:00',
        change: Globalize.format()
    }).val('Manual');


    $('.virtualPumpSpeed').on("spinchange", function (e, ui) {
        // console.log('virtual pump spin change', e, ui)
        // console.log('vpsc this:', $(this).spinner('value'), $(this))
        // console.log('vpsc data:', $(this).data('program'), $(this).data('pumpid'))
        socket.emit('setPumpProgramSpeed', $(this).data('pumpid'), $(this).data('program'), $(this).spinner('value'))
    })


    $('.virtualPumpSpeedType').on('click', function (e) {
        $(this).toggleClass('btn-primary')  //add button color to "this" button
        $(this).siblings().toggleClass('btn-primary') //remove button color from sibling
        var el = '.virtualPumpSpeed[data-pumpid="' + $(this).data("pumpid") + '"][data-program="' + $(this).data('program') + '"]'
        if ($(this).data('speedtype') === 'gpm') {
            updateVirtualPumpSpinner(el, 30)
            socket.emit('setPumpProgramSpeed', $(this).data('pumpid'), $(this).data('program'), 30)
        }
        else {
            updateVirtualPumpSpinner(el, 1000)
            socket.emit('setPumpProgramSpeed', $(this).data('pumpid'), $(this).data('program'), 1000)
        }
    })


    $('#pumpType[data-pumpid="1"], #pumpType[data-pumpid="2"]').selectpicker({
        mobile: jQuery.browser.mobile, //if true, use mobile native scroll, else format with selectpicker css
    });

    $('#pumpType[data-pumpid="1"], #pumpType[data-pumpid="2"]').on('changed.bs.select', function (e, clickedIndex, newValue, oldValue) {
        //console.log('pump %s type:', $(this).data('pumpid'), $(this).val())
        socket.emit('setPumpType', $(this).data('pumpid'), $(this).val())
    })

    $('#pump1Edit, #pump2Edit').click(function () {
        pumpManualButtonsEnableDisable($(this).data('pumpid'), 'enable')
        $('#pump' + $(this).data('pumpid') + 'EditResume').show()
    })

    $('#pump1EditResume, #pump2EditResume').click(function () {
        pumpManualButtonsEnableDisable($(this).data('pumpid'), 'disable')
        prevPumpMode[$(this).data('pumpid')].mode = ''
        prevPumpMode[$(this).data('pumpid')].value = ''
        socket.emit('pump')
    })
}


function updateVirtualPumpSpinner(el, val) {
    // keep these values hardcoded or else we run into scoping issues
    if (val < 150) {
        $(el).spinner({
            //min: 15,
            //max: 130,
            step: 1,
            page: 5,
            spin: function (event, ui) {
                if (ui.value > 130) {
                    $(this).spinner("value", 15);
                    return false;
                } else if (ui.value < 15) {
                    $(this).spinner("value", 130);
                    return false;
                }
            }
        }).val(val)
    }
    else {
        $(el).spinner({
            //min: 450,
            //max: 3450,
            step: 10,
            page: 20,
            spin: function (event, ui) {
                if (ui.value > 3450) {
                    $(this).spinner("value", 450);
                    return false;
                } else if (ui.value < 450) {
                    $(this).spinner("value", 3450);
                    return false;
                }
            }
        }).val(val)
    }
}


var reconnectTimer = false

// Refresh / Update status button (showing last message / information received)
function lastUpdate(reset) {

    var tmeCurrent = Date.now();
    if (typeof(tmeLastUpd) === "undefined")
        tmeLastUpd = tmeCurrent;
    tmeDelta = (tmeCurrent - tmeLastUpd) / 1000;
    domDelta = $('#tmrLastUpd')
    domDelta[0].innerHTML = 'Last Update<br/>' + tmeDelta.toFixed(0) + ' secs ago';

    if (typeof(generalParams) !== "undefined") {
        if (tmeDelta <= generalParams.tmeSuccess) {
            domDelta.removeClass('btn-warning');
            domDelta.removeClass('btn-danger');
            domDelta.addClass('btn-success');
        } else if (tmeDelta <= generalParams.tmeWarning) {
            domDelta.removeClass('btn-success');
            domDelta.removeClass('btn-danger');
            domDelta.addClass('btn-warning');
        } else {
            domDelta.removeClass('btn-success');
            domDelta.removeClass('btn-warning');
            domDelta.addClass('btn-danger');
        }
    }
    if (reset === true) {
        tmeLastUpd = tmeCurrent;
        reconnectTimer = false
    }
    if (tmeDelta >= 20) {
        if (reconnectTimer === false) {
            socket.open()
            reconnectTimer = true
        }
    }
}

var loadAppSettings = function () {
    $.getJSON('../config', function (appConfig) {
        appParams = appConfig.config
        console.log(appParams)
        if (appParams.systemReady) {

            startSocketRx();
            // Finally, initialize Panel and button handling
            handlePanels();
            handleButtons();

            // Callback Routine, every second - to update / record time since last message received
            setInterval(function () {
                lastUpdate(false)
            }, 1000);
        }
        else {
            console.log('poolController app not ready yet')
            setTimeout(loadAppSettings, 1000 * 5)
        }
    })


}

// From http://api.jquery.com/jquery/#jQuery3
// JQuery(callback), Description: Binds a function to be executed when the DOM has finished loading
$(function () {


    // Avoid namespace conflicts
    var bootstrapButton = jQuery.fn.button.noConflict() // return $.fn.button to previously assigned value
    jQuery.fn.bootstrapBtn = bootstrapButton // give $().bootstrapBtn the Bootstrap functionality

    // Set up draggable options => allow to move panels around
    var panelList = $('#draggablePanelList');
    panelList.sortable({
        // Only make the .panel-heading child elements support dragging.
        // Omit this to make then entire <li>...</li> draggable.
        handle: '.panel-heading',
        update: function () {
            var panelIndices = [];
            panelList.children().each(function () {
                panelIndices[$(this).index()] = $(this).attr('id');
            });
            localStorage.setItem('panelIndices', JSON.stringify(panelIndices));
        }
    });

    // Load configuration (from json), process once data ready
    $.getJSON('configClient.json', function (json) {
        // Configure panels (visible / hidden, sequence)
        configPanels(json.panelState);
        // Call routine to recursively parse Equipment Configuration, setting associated data for DOM elements
        dataAssociate("base", json.equipConfig);
        // Log Pump Parameters (rows to output) => no var in front, so global
        pumpParams = json.pumpParams;
        // Log test colorization => no var in front, so global
        logColors = json.logLevels;
        // General JS Parameters (for this code)
        generalParams = json.generalParams;
        // And Now, initialize Socket IO (as client configuration in place now)
        socket = io({reconnectionDelay: 20000, reconnection: true, reconnectionDelayMax: 20000});

        loadAppSettings();
    });


    $('body').scrollspy({
        target: '#pool_navbar'
    })
});
