/* global Storage */
var autoDST; // Flag for Automatic DST (0 = manual, 1 = automatic)
var tmeLastUpd; // Time of Last Update (last socket message received)
var socket; // Socket IO (don't initalize communications until clientConfig.json received!)

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
            var sizeStorage = panelIndices.filter(function(value) {
                return value !== null
            }).length;
            if (sizeStorage === panelListItems.length) {
                panelListItems.detach();
                $.each(panelIndices, function() {
                    var currPanel = this.toString();
                    var result = $.grep(panelListItems, function(e) {
                        return e.id === currPanel;
                    });
                    panelList.append(result);
                });
            }
        }
    } else {
        $('#txtDebug').append('Sorry, your browser does not support Web Storage.' + '<br>');
    }
};

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

function setStatusButton(btnID, btnState, btnLeadingText) {
    // Check for Leading Text
    if (typeof btnLeadingText === "undefined")
        btnLeadingText = '';
    // Set Button State
    if (btnState === 1) {
        btnID.html(btnLeadingText + 'On');
        btnID.removeClass('btn-primary');
        btnID.addClass('btn-success');
    } else {
        btnID.html(btnLeadingText + 'Off');
        btnID.removeClass('btn-success');
        btnID.addClass('btn-primary');
    }
}

function buildSchTime(currSchedule) {
    schName = 'schTime' + currSchedule.ID;
    strRow = '<tr name="' + schName + '" id="' + schName + '" class="botpad">';
    strHTML = '<td>' + currSchedule.ID + '</td>' +
        '<td>' + currSchedule.CIRCUIT.capitalizeFirstLetter() + '</td>' +
        '<td>' + fmt12hrTime(currSchedule.START_TIME) + '</td>' +
        '<td>' + fmt12hrTime(currSchedule.END_TIME) + '</td></tr>';
    return strRow + strHTML;
}

function buildEggTime(currSchedule) {
    schName = 'schEgg' + currSchedule.ID;
    strRow = '<tr name="' + schName + '" id="' + schName + '">';
    strHTML = '<td>' + currSchedule.ID + '</td>' +
        '<td>' + currSchedule.CIRCUIT.capitalizeFirstLetter() + '</td>' +
        '<td>' + fmtEggTimerTime(currSchedule.DURATION) + '</td></tr>';
    return strRow + strHTML;
}

function buildSchDays(currSchedule) {
    schName = 'schDays' + currSchedule.ID;
    strRow = '<tr class="borderless toppad" name="' + schName + '" id="' + schName + '" class="botpad"><td colspan="4" align="left">';
    var arrDays = [false, false, false, false, false, false, false];
    splitDays = currSchedule.DAYS.split(" ");
    $.each(splitDays, function(indx, currDay) {
        if (currDay !== "")
            arrDays[dayOfWeekAsInteger(currDay)] = true;
    });
    strHTML = '';
    for (var iterDay in arrDays) {
        strCurrDay = dayOfWeekAsString(iterDay);
        if (arrDays[iterDay] === true) {
            strHTML += '<button class="btn btn-success btn-md" id="' + strCurrDay + '">';
        } else {
            strHTML += '<button class="btn btn-default btn-md" id="' + strCurrDay + '">';
        }
        strHTML += strCurrDay + '</button>';
    }
    return strRow + strHTML + '</td></tr>';
}

function formatLog(strMessage) {
    // Colorize Message, in HTML format
    var strSplit = strMessage.split(' ');
    if (typeof(logColors) !== "undefined")
        var strColor = logColors[strSplit[1].toLowerCase()];
    else
        strColor = "lightgrey";
    if (strColor) {
        strSplit[1] = strSplit[1].fontcolor(strColor).bold();
    }

    // And output colorized string to Debug Log (Panel)
    $('#txtDebug').append(strSplit.join(' ') + '<br>');
    $("#txtDebug").scrollTop($("#txtDebug")[0].scrollHeight);
}

String.prototype.capitalizeFirstLetter = function() {
    return this.charAt(0).toUpperCase() + this.toLowerCase().slice(1);
};

String.prototype.toTitleCase = function() {
    return this.replace(/\w\S*/g, function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
};

// Function to configure communications sockets receive handling -> not called until clientConfig.json available (i.e. configuration complete)
function startSocketRx() {
    socket.on('circuit', function(data) {
        if (data !== null) {
            $.each(data, function(indx, currCircuit) {
                if (currCircuit.hasOwnProperty('friendlyName')) {
                    // Check for POOL or SPA - then ignore friendlyName, need to use circuitFunction for these two!
                    if ((currCircuit.circuitFunction.toUpperCase() === "POOL") || (currCircuit.circuitFunction.toUpperCase() === "SPA"))
                        currName = currCircuit.circuitFunction.toUpperCase();
                    else
                        currName = currCircuit.friendlyName;
                    if (currName !== "NOT USED") {
                        if (document.getElementById(currName)) {
                            setStatusButton($('#' + currName), currCircuit.status);
                            $('#' + currName).data(currName, currCircuit.number);
                        } else if (document.getElementById(currCircuit.numberStr)) {
                            setStatusButton($('#' + currCircuit.numberStr), currCircuit.status);
                            $('#' + currCircuit.numberStr).data(currCircuit.numberStr, currCircuit.number);
                        } else if ((generalParams.hideAUX === false) || (currName.indexOf("AUX") === -1)) {
                            $('#features tr:last').after('<tr><td>' + currName.toLowerCase().toTitleCase() + '</td><td><button class="btn btn-primary btn-md" name="' + currCircuit.numberStr + '" id="' + currCircuit.numberStr + '">---</button></td></tr>');
                            setStatusButton($('#' + currCircuit.numberStr), currCircuit.status);
                            $('#' + currCircuit.numberStr).data(currCircuit.numberStr, currCircuit.number);
                        }
                    }
                }
            });
        }
        lastUpdate(true);
    });

    socket.on('pump', function(data) {
        if (data !== null) {
            // Build Pump table / panel
            $.each(data, function(indx, currPump) {
                if (currPump === null) {
                    //console.log("Pump: Dataset empty.")
                } else {
                    if (currPump !== "blank") {
                        // New Pump Data (Object) ... make sure pumpParams has been read / processed (i.e. is available)
                        if (typeof(pumpParams) !== "undefined") {
                            if (typeof(currPump["name"]) !== "undefined") {
                                // Determine if we need to add a column (new pump), or replace data - and find the target column if needed
                                var rowHeader = $('#pumps tr:first:contains(' + currPump["name"] + ')');
                                var colAppend = rowHeader.length ? false : true;
                                if (colAppend === false) {
                                    var colTarget = -1;
                                    $('th', rowHeader).each(function(index) {
                                        if ($(this).text() === currPump["name"])
                                            colTarget = index;
                                    });
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
                                        $('td', rowTarget).each(function(index) {
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

    socket.on('heat', function(data) {
        if (data !== null) {
            $('#poolHeatSetPoint').html(data.poolSetPoint);
            $('#poolHeatMode').data('poolHeatMode', data.poolHeatMode);
            $('#poolHeatModeStr').html(data.poolHeatModeStr);
            $('#spaHeatSetPoint').html(data.spaSetPoint);
            $('#spaHeatMode').data('spaHeatMode', data.spaHeatMode);
            $('#spaHeatModeStr').html(data.spaHeatModeStr);
        }
        lastUpdate(true);
    });

    socket.on('chlorinator', function(data) {
        //var data = {"saltPPM":2900,"currentOutput": 12, "outputPoolPercent":7,"outputSpaPercent":-1,"superChlorinate":0,"version":0,"name":"Intellichlor--40","status":"Unknown - Status code: 128"};
        if (data !== null) {
            if ((data.currentOutput > 0))
                setStatusButton($('#CHLORINATOR'), 1);
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

            // if (data.outputSpaPercent === -1)
            //   $('#chlorinatorSpaPercent').parent().hide();
            // else
            // 	$('#chlorinatorSpaPercent').parent().show();
            // 	$('#chlorinatorSpaPercent').html(data.outputSpaPercent + '%');
            $('#chlorinatorPoolPercent').html(chlorStr);

            if (data.superChlorinate === 1)
                $('#chlorinatorSuperChlorinate').html('True');
            else
                $('#chlorinatorSuperChlorinate').html('False');
           $('#chlorinatorStatus').html(data.status);
        }
        lastUpdate(true);
    });

    socket.on('schedule', function(data) {
        if (data !== null) {
            // Schedule/EggTimer to be updated => Wipe, then (Re)Build Below
            $('#schedules tr').not('tr:first').remove();
            $('#eggtimers tr').not('tr:first').remove();
            // And (Re)Build Schedule and EggTimer tables / panels
            $.each(data, function(indx, currSchedule) {
                if (currSchedule === null) {
                    //console.log("Schedule: Dataset empty.")
                } else {
                    if (currSchedule !== "blank") {
                        if (currSchedule.MODE === "Schedule") {
                            // Schedule Event (if circuit used)
                            if (currSchedule.CIRCUIT !== 'NOT USED') {
                                $('#schedules tr:last').after(buildSchTime(currSchedule) + buildSchDays(currSchedule));
                            }
                        } else {
                            // EggTimer Event (if circuit used)
                            if (currSchedule.CIRCUIT !== 'NOT USED') {
                                $('#eggtimers tr:last').after(buildEggTime(currSchedule));
                            }
                        }
                    }
                }
            });
        }
        lastUpdate(true);
    });

    socket.on('outputLog', function(data) {
        formatLog(data);
        lastUpdate(true);
    });

    socket.on('time', function(data) {
        // Update Date and Time (buttons) - custom formatted
        var newDT = new Date(data.controllerDateStr + ' ' + data.controllerTime)
        $('#currDate').val(newDT.getDate() + '-' + monthOfYearAsString(newDT.getMonth()) + '-' + newDT.getFullYear().toString().slice(-2));
        $('#currTime').val(fmt12hrTime(newDT.getHours() + ':' + newDT.getMinutes()));
        // Initialize (and configure) Date and Clock Pickers for button (input) => gated on getting time once, to determine DST setting!
        autoDST = data.automaticallyAdjustDST;
        $('#currDate').datepicker({
            dateFormat: 'dd-M-y',
            onSelect: function() {
                var newDT = new Date($('#currDate').val() + ' ' + $('#currTime').val());
                socket.emit('setDateTime', newDT.getHours(), newDT.getMinutes(), Math.pow(2, newDT.getDay()), newDT.getDate(), newDT.getMonth() + 1, newDT.getFullYear().toString().slice(-2), autoDST);
            }
        });
        $('#currTime').clockpicker({
            donetext: 'OK',
            twelvehour: false,
            beforeShow: function() {
                $('#currTime').val(fmt24hrTime($('#currTime').val()));
            },
            afterShow: function() {
                $('#currTime').val(fmt12hrTime($('#currTime').val()));
            },
            afterHide: function() {
                $('#currTime').val(fmt12hrTime($('#currTime').val()));
            },
            afterDone: function() {
                $('#currTime').val(fmt12hrTime($('#currTime').val()));
                var newDT = new Date($('#currDate').val() + ' ' + $('#currTime').val());
                socket.emit('setDateTime', newDT.getHours(), newDT.getMinutes(), Math.pow(2, newDT.getDay()), newDT.getDate(), newDT.getMonth() + 1, newDT.getFullYear().toString().slice(-2), autoDST);
            }
        });
        lastUpdate(true);
    });

    socket.on('temp', function(data) {
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
        lastUpdate(true);
    });

    socket.on('updateAvailable', function(data) {
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
function setHeatSetPoint(equip, change) {
    socket.emit('setHeatSetPoint', equip, change);
}

function setHeatMode(equip, change) {
    socket.emit('setHeatMode', equip, change);
}

function setEquipmentStatus(equipment) {
    if (equipment !== undefined)
        socket.emit('toggleCircuit', equipment);
    else
        formatLog('ERROR: Client, equipment = undefined');
};

// Initialize Panel Handling Routines (Callbacks)
function handlePanels() {
    // Panel Handling: When Panel is being collapsed or shown => save current state to configClient.json (i.e. set to be the default on load)
    $(".panel-collapse").on('show.bs.collapse', function(btnSelected) {
        var btnID = btnSelected.target.id;
        var strID = btnID.replace('collapse', '').toLowerCase();
        socket.emit('setConfigClient', 'panelState', strID, 'state', 'visible')
    });
    $(".panel-collapse").on('hide.bs.collapse', function(btnSelected) {
        var btnID = btnSelected.target.id;
        var strID = btnID.replace('collapse', '').toLowerCase();
        socket.emit('setConfigClient', 'panelState', strID, 'state', 'collapse')
    });
}

// Initialize Button Handling Routines (Callbacks)
function handleButtons() {

    // Button Handling: gitState => Hide Code State (and flag upstream). Note, hidden to start (default, in index.html), unhide (change visibility) if state received.
    $('#gitState').click(function() {
		$('#gitState')[0].style.visibility = "hidden";
		socket.emit('updateVersionNotification', true);
    });
	
    // Button Handling: Hide Panel, and Store / Update Config (so hidden permanently, unless reset!)
    $('button').click(function(btnSelected) {
        var btnID = btnSelected.target.id;
        // If Panel Hide selected => then do it!
        if (btnID.search('hidePanel') === 0) {
            var strID = btnID.replace('hidePanel', '');
            $('#' + strID).hide();
            socket.emit('setConfigClient', 'panelState', strID, 'state', 'hidden')
        }
    });

    // Button Handling: Reset Button Layout (reset all panels in configClient.json to visible)
    $('#btnResetLayout').click(function() {
		socket.emit('updateVersionNotification', false);
        $.getJSON('configClient.json', function(json) {
            // Panel Data Retrieved, now reset all of them to visible (store to configClient.json, and make visible immediately)
            for (var currPanel in json.panelState) {
                socket.emit('setConfigClient', 'panelState', currPanel, 'state', 'visible')
                $('#' + currPanel).show();
            }
        });
    });

    // Button Handling: Pool, Spa => On/Off
    $('#poolState, #spaState').on('click', 'button', function() {
        setEquipmentStatus($(this).data($(this).attr('id')));
    });

    // Button Handling: Pool / Spa, Temperature SetPoint
    $('#poolSetpoint, #spaSetpoint').on('click', 'button', function() {
        setHeatSetPoint($(this).data('equip'), $(this).data('adjust'));
    });

    // Button Handling: Pool / Spa, Heater Mode
    $('#poolHeatMode, #spaHeatMode').on('click', 'button', function() {
        var currButtonPressed = $(this).attr('id');
        if (currButtonPressed.includes('HeatMode')) {
            var strHeatMode = currButtonPressed.slice(0, currButtonPressed.indexOf('HeatMode')) + 'HeatMode';
            var currHeatMode = $('#' + strHeatMode).data(strHeatMode);
            var newHeatMode = (currHeatMode + 4 + $(this).data('heatModeDirn')) % 4;
            setHeatMode($('#' + strHeatMode).data('equip'), newHeatMode);
        }
    });

    // Button Handling: Features => On/Off
    $('#features').on('click', 'button', function() {
        setEquipmentStatus($(this).data($(this).attr('id')));
    });

    // Button Handling: Debug Log => On/Off
    $('#debugEnable').click(function() {
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
    $('#txtDebug').keypress(function(event) {
        if (event.key === "A") {
            var sel, range;
            var el = $(this)[0];
            sel = window.getSelection();
            if (sel.toString() === '') { //no text selection
                window.setTimeout(function() {
                    range = document.createRange(); //range object
                    range.selectNodeContents(el); //sets Range
                    sel.removeAllRanges(); //remove all ranges from selection
                    sel.addRange(range); //add Range to a Selection.
                }, 1);
            }
        }
    });

    // Button Handling: Debug Log => Clear!
    $('#debugClear').click(function() {
        $('#txtDebug').html('<b>DEBUG LOG ... <br />');
    });

    // Button Handling: Modal, Save Settings for Chlorinator ... and second function, so keypress (Enter Key) fires input
    $('#SaveChanges').click(function() {
        $('#modalChlorinator').modal('hide');
        var chlorSetting = parseFloat($('#modalChlorInput')[0].value);
        if ((chlorSetting >= 0) && (chlorSetting <= 101))
            socket.emit('setchlorinator', chlorSetting);
    });
    $('#modalChlorinator').keypress(function(key) {
        if (key.which == 13)
            $('#SaveChanges').click();
    })
}

// Refresh / Update status button (showing last message / information received)
function lastUpdate(reset) {
    var tmeCurrent = Date.now();
    if (typeof(tmeLastUpd) === "undefined")
        tmeLastUpd = tmeCurrent;
    tmeDelta = (tmeCurrent - tmeLastUpd) / 1000;
    domDelta = $('#tmrLastUpd')
    domDelta[0].innerHTML = 'Last Update ... <br/>' + tmeDelta.toFixed(1) + ' sec ago';
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
    if (reset === true)
        tmeLastUpd = tmeCurrent;
}

// From http://api.jquery.com/jquery/#jQuery3
// JQuery(callback), Description: Binds a function to be executed when the DOM has finished loading
$(function() {
    // Callback Routine, every second - to update / record time since last message received
    setInterval(function() {
        lastUpdate(false)
    }, 1000);

    // Set up draggable options => allow to move panels around
    var panelList = $('#draggablePanelList');
    panelList.sortable({
        // Only make the .panel-heading child elements support dragging.
        // Omit this to make then entire <li>...</li> draggable.
        handle: '.panel-heading',
        update: function() {
            var panelIndices = [];
            panelList.children().each(function() {
                panelIndices[$(this).index()] = $(this).attr('id');
            });
            localStorage.setItem('panelIndices', JSON.stringify(panelIndices));
        }
    });

    // Load configuration (from json), process once data ready
    $.getJSON('configClient.json', function(json) {
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
        socket = io();
        startSocketRx();
        // Finally, initialize Panel and button handling
        handlePanels();
        handleButtons();
    });
});
