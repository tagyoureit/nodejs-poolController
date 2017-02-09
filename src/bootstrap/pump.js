/* global Storage */
jsVersion = 'v0.1.0';

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
                setStatusButton($('#debugEnable'), 0);
            else
                setStatusButton($('#debugEnable'), 1);
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

function dayOfWeekAsInteger(strDay) {
    return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(strDay.capitalizeFirstLetter(strDay));
}

function dayOfWeekAsString(indDay) {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][indDay];
}

function fmtScheduleTime(strInpStr) {
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

function fmtEggTimerTime(strInpStr) {
    splitInpStr = strInpStr.split(":");
    strHours = splitInpStr[0];
    strMins = ('0' + parseInt(splitInpStr[1])).slice(-2);
    return strHours + ' hrs, ' + strMins + ' mins';
}

function setStatusButton(btnID, btnState) {
    if (btnState === 1) {
        btnID.html('On');
        btnID.removeClass('btn-primary');
        btnID.addClass('btn-success');
    } else {
        btnID.html('Off');
        btnID.removeClass('btn-success');
        btnID.addClass('btn-primary');
    }
}

function buildSchTime(currSchedule) {
    schName = 'schTime' + currSchedule.ID;
    strRow = '<tr name="' + schName + '" id="' + schName + '" class="botpad">';
    strHTML = '<td>' + currSchedule.ID + '</td>' +
        '<td>' + currSchedule.CIRCUIT.capitalizeFirstLetter() + '</td>' +
        '<td>' + fmtScheduleTime(currSchedule.START_TIME) + '</td>' +
        '<td>' + fmtScheduleTime(currSchedule.END_TIME) + '</td></tr>';
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
    splitDays.forEach(function(currDay, indx) {
        if (currDay !== "")
            arrDays[dayOfWeekAsInteger(currDay)] = true;
    });
    strHTML = '';
    for (var iterDay in arrDays) {
        strCurrDay = dayOfWeekAsString(iterDay);
        if (arrDays[iterDay] === true) {
            strHTML += '<button class="btn btn-success btn-xs" id="' + strCurrDay + '">';
        } else {
            strHTML += '<button class="btn btn-default btn-xs" id="' + strCurrDay + '">';
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

// From http://api.jquery.com/jquery/#jQuery3
// JQuery(callback), Description: Binds a function to be executed when the DOM has finished loading
$(function() {
    // Display JavaScript Version
    $('#jsVersion').html(jsVersion);

    // Initialize variables
    var tmeLastUpd;
    var socket = io();

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
    });



    // Button Handling: Debug Log => On/Off
    $('#debugEnable').click(function() {
        if ($('#debug').is(":visible") === true) {
            $('#debug').hide();
            setStatusButton($('#debugEnable'), 0);
        } else {
            $('#debug').show();
            setStatusButton($('#debugEnable'), 1);
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


    var action = 'run' //default
    $("#actionpump1 :input").change(function() {
        console.log(this.value)
        action = $('#actionpump1 input:radio:checked').data('value')
        console.log(action)
        if (action === 'off') {
            disableStuff(1, 1, 1)
        } else if (action === 'run') {
            disableStuff(0, 1, 0)
            enableStuff(1, 0, 1)
        } else if (action === 'saverun') {
            enableStuff(1, 1, 1)
        } else if (action === 'save') {
						// $('#pump1label2').addClass('active')
						// $('#pump1label1').attr('disabled', true)
						//$('#programpumpoption1').
            enableStuff(1, 1, 0)
            disableStuff(0, 0, 1)
        }
        setResult()
    })

		var programOrRPM = 'program'
    var program = 'No program';
    $("#programpump1 > radio.btn").on("click", function() {
        //$(this).addClass('active').siblings().removeClass('active');
        program = this.innerHTML;
        alert("Value is " + program);
			 programOrRPM = 'program'
				setResult()
    });


    $("#programpump1").click(function() {
        if (action === 'run') {
            disableStuff(0, 1, 0)
            enableStuff(1, 0, 0)
        }
				programOrRPM = 'program'
    })

    $('#rpmpump1').click(function() {
        if (action === 'run') {
            disableStuff(1, 0, 0)
            enableStuff(0, 1, 0)
        }
				programOrRPM = 'program'
    })

		var duration=-1
		$('#durationpump1 :input').change(function(){
			duration = this.value
		})

		var rpm = 450

				$('#rpmpump1 :input').change(function(){
					rpm = this.value
				})

    function disableStuff(program, rpm, duration) {
        if (program === 1) {
            $('#programpump1 label').attr("disabled", true)
        }
        if (rpm === 1) {
            $('#rpmpump1 :input').attr("disabled", true)
        }
        if (duration === 1) {
            $('#durationpump1 :input').attr("disabled", true)
        }
    }

    function enableStuff(program, rpm, duration) {
        if (program === 1) {
            $('#programpump1 label').removeAttr("disabled")
        }
        if (rpm === 1) {
            $('#rpmpump1 :input').removeAttr("disabled")
        }
        if (duration === 1) {
            $('#durationpump1 :input').removeAttr("disabled")
        }
    }

    function setResult() {
        if (action === 'off') {
            $('#result1').text('Pump X will turn off')
        } else if (action === 'run') {
						var tmp = 'Pump X will run '
						if (programOrRPM === 'program'){
							tmp += 'program ' + program
						}
						else {
							tmp += 'at RPM ' + rpm
						}
						$('#result1').text(tmp)

        }
				alert($('#result1').text())
    }
    // Button Handling: Modal, Save Settings for Chlorinator ... and second function, so keypress (Enter Key) fires input
    $('#SavePump1Changes').click(function() {

        $('#pumpAlert').html(num + ' ' + action)
        $('#pumpAlert').fadeIn();
        closeAlertBox()
    });

    function closeAlertBox() {
        window.setTimeout(function() {
            $("#pumpAlert").fadeOut(300)
        }, 3000);
    }

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


    // Socket Events (Receive)
    socket.on('circuit', function(data) {
        if (data !== null) {
            data.forEach(function(currCircuit, indx) {
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
                            $('#features tr:last').after('<tr><td>' + currName.toLowerCase().toTitleCase() + '</td><td><button class="btn btn-primary btn-xs" name="' + currCircuit.numberStr + '" id="' + currCircuit.numberStr + '">---</button></td></tr>');
                            setStatusButton($('#' + currCircuit.numberStr), currCircuit.status);
                            $('#' + currCircuit.numberStr).data(currCircuit.numberStr, currCircuit.number);
                        }
                    }
                }
            });
        }
        lastUpdate(true);
    });


    //change the name of the button to the selection
    $(".dropdown-menu li a").click(function() {
        $(this).parents(".dropdown").find('.btn').html($(this).text() + ' <span class="caret"></span>');
        $(this).parents(".dropdown").find('.btn').val($(this).data('value'));
    });

    //change the name of the button to the selection
    $(".dropdown-menu li a").click(function() {
        $(this).parents(".btn-group").find('.btn:first-child').html($(this).text());
        $(this).parents(".btn-group").find('.btn:first-child').val($(this).data('value'));
    });

    // With JQuery
    $('#ex1').bootstrapSlider({
        formatter: function(value) {
            return 'Current value: ' + value;
        }
    });

    socket.on('pump', function(data) {
        if (data !== null) {
            // Build Pump table / panel
            data.forEach(function(currPump, indx) {
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


    socket.on('chlorinator', function(data) {
        //var data = {"saltPPM":2900,"outputPoolPercent":7,"outputSpaPercent":-1,"superChlorinate":0,"version":0,"name":"Intellichlor--40","status":"Unknown - Status code: 128"};
        if (data !== null) {
            if ((data.outputPoolPercent > 0) || (data.outputSpaPercent > 0))
                setStatusButton($('#CHLORINATOR'), 1);
            else
                setStatusButton($('#CHLORINATOR'), 0);
            $('#chlorinatorName').html(data.name);
            $('#chlorinatorSalt').html(data.saltPPM + ' ppm');
            $('#chlorinatorPoolPercent').html(data.outputPoolPercent + '%');
            if (data.outputSpaPercent === -1)
                $('#chlorinatorSpaPercent').parent().hide();
            else
                $('#chlorinatorSpaPercent').parent().show();
            $('#chlorinatorSpaPercent').html(data.outputSpaPercent + '%');
            if (data.superChlorinate === 1)
                $('#chlorinatorSuperChlorinate').html('True');
            else
                $('#chlorinatorSuperChlorinate').html('False');
        }
        lastUpdate(true);
    });


    socket.on('outputLog', function(data) {
        formatLog(data);
        lastUpdate(true);
    });



    function lastUpdate(reset) {
        var tmeCurrent = Date.now();
        if (typeof(tmeLastUpd) === "undefined")
            tmeLastUpd = tmeCurrent;
        tmeDelta = (tmeCurrent - tmeLastUpd) / 1000;
        domDelta = $('#tmrLastUpd')
        domDelta[0].innerHTML = 'Last Update: ' + tmeDelta.toFixed(1) + ' sec ago';
        if (typeof(generalParams) !== "undefined") {
            if (tmeDelta <= generalParams.tmeSuccess) {
                domDelta.removeClass('label-warning');
                domDelta.removeClass('label-danger');
                domDelta.addClass('label-success');
            } else if (tmeDelta <= generalParams.tmeWarning) {
                domDelta.removeClass('label-success');
                domDelta.removeClass('label-danger');
                domDelta.addClass('label-warning');
            } else {
                domDelta.removeClass('label-success');
                domDelta.removeClass('label-warning');
                domDelta.addClass('label-danger');
            }
        }
        if (reset === true)
            tmeLastUpd = tmeCurrent;
    }
});
