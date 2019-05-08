var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/* jshint undef: false, unused: true , latedef: false*/

/* global storage */
var socket;
var systemReady = 0; // are all the pool functions/features initialized?

function initializeObjects() {
    //set active menu item
    $("a.nav-link").on("click", function () {
        $(".navbar-nav>li>a").removeClass("active");
        $(this).addClass("active");
    });

    // collapse navbark when selecting
    // https://stackoverflow.com/questions/42401606/how-to-hide-collapsible-bootstrap-4-navbar-on-click
    $('.navbar-nav>li>a').on('click', function () {
        $('.navbar-collapse').collapse('hide');
    });
}

function buildCards() {

    $("#alert").append($('<div/>', { text: "System Loading...", class: "card-header text-primary" })).append($('<div/>', { text: "Need to configure your pool system?", class: "card-body" }).append($('<br>')).append($('<a/>', { href: "configure.html", text: "Configure now..." })));

    $("#release").append($('<div/>', { text: "Header", class: "card-header" })).append($('<div/>', { text: "Release Details", class: "card-body" }).append($('<p/>', { text: "some quick text", class: "card-text" })));

    $("#systeminformation").addClass("d-none poolPanel").append($('<div/>', { text: "System Information", class: "card-header" })).append($('<ul/>', { class: "list-group list-group-flush" }).append($('<li/>', { text: "Date", class: "list-group-item" }).append($('<input/>', {
        class: "float-right btn btn-primary btn-md p-1",
        value: "some date",
        type: "button",
        id: "currDate"
    }))).append($('<li/>', { text: "Time", class: "list-group-item" }).append($('<input/>', {
        class: "float-right btn btn-primary btn-md p-1",
        value: "some text",
        type: "button",
        id: "currTime"
    }))).append($('<li/>', { text: "Air Temp", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "air temp", id: "airTemp" }))).append($('<li/>', { text: "Solar Temp", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "solar temp", id: "solarTemp" }))).append($('<li/>', { text: "Freeze Prot", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "frz", id: "stateFreeze" }))));

    $("#pool").addClass("d-none poolPanel").append($('<div/>', { text: "Pool Details", class: "card-header" })).append($('<ul/>', { class: "list-group list-group-flush " }).append($('<li/>', { text: "Pool State", class: "list-group-item" }).append($('<input/>', {
        class: "float-right btn btn-primary btn-md p-1",
        value: "pool state",
        type: "button",
        id: "POOL"
    }))).append($('<li/>', { text: "Temperature", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "temp", id: "poolCurrentTemp" }))).append($('<li/>', { text: "Set Point", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "BETTER BUTTONS", id: "poolSetPont" }))).append($('<li/>', { text: "Heater Mode", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "BETTER BUTTONS", id: "poolHeatModeStr" }))));

    $("#spa").addClass("d-none poolPanel").append($('<div/>', { text: "Spa Details", class: "card-header" })).append($('<ul/>', { class: "list-group list-group-flush" }).append($('<li/>', { text: "Spa State", class: "list-group-item" }).append($('<input/>', {
        class: "float-right btn btn-primary btn-md p-1",
        value: "spa state",
        type: "button",
        id: "SPA"
    }))).append($('<li/>', { text: "Temperature", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "temp", id: "spaCurrentTemp" }))).append($('<li/>', { text: "Set Point", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "BETTER BUTTONS", id: "spaSetPont" }))).append($('<li/>', { text: "Heater Mode", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "BETTER BUTTONS", id: "spaHeatModeStr" }))));

    $("#chlorinator").addClass("d-none poolPanel").append($('<div/>', { text: "Chlorinator", class: "card-header" })).append($('<ul/>', { class: "list-group list-group-flush" }).append($('<li/>', { text: "Chorinator State", class: "list-group-item" }).append($('<input/>', {
        class: "float-right btn btn-primary btn-md p-1",
        value: "chlor val",
        type: "button",
        id: "CHLORINATOR"
    }))).append($('<li/>', { text: "Name", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "name", id: "chlorinatorName" }))).append($('<li/>', { text: "Salt", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "salt", id: "chlorinatorSalt" }))).append($('<li/>', { text: "Pool/Spa Output", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "output", id: "chlorinatorPoolPercent" }))).append($('<li/>', { text: "Super Chlorinate", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "super", id: "chlorinatorSuperChlorinate" }))).append($('<li/>', { text: "Status", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "status", id: "chlorinatorStatus" }))).append($('<li/>', { text: "Controlled By", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "controlledby", id: "chlorinatorControlledBy" }))));

    $("#feature").addClass("d-none poolPanel").append($('<div/>', { text: "Features", class: "card-header" })).append($('<ul/>', { class: "list-group list-group-flush" }));

    $("#pump").addClass("d-none poolPanel").append($('<div/>', { text: "Pump Information", class: "card-header" })).append($('<ul/>', { class: "list-group list-group-flush" }).append($('<li/>', { text: "", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "pump2", id: "pump2Name" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "pump1", id: "pump1Name" }))).append($('<li/>', { text: "Watts", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "watts2", id: "pump2Watts" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "watts1", id: "pump1Watts" }))).append($('<li/>', { text: "RPM", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "rpm2", id: "pump2RPM" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "rpm2", id: "pump1RPM" }))).append($('<li/>', { text: "Error", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "error2", id: "pump2Error" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "error1", id: "pump1Error" }))).append($('<li/>', { text: "Drive State", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "ds2", id: "pump2DriveState" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "ds1", id: "pump1DriveState" }))).append($('<li/>', { text: "Run Mode", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "run2", id: "pump2RunMode" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "run1", id: "pump1RunMode" }))));

    $("#schedule").addClass("d-none poolPanel").append($('<div/>', { text: "Schedule Information", class: "card-header" })).append($('<ul/>', { class: "list-group list-group-flush" }).append($('<li/>', { text: "Circuit", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "End Time", id: "schedule2Name" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "Start Time", id: "schedule1Name" }))));

    $("#eggtimer").addClass("d-none poolPanel").append($('<div/>', { text: "Eggtimer Information", class: "card-header" })).append($('<ul/>', { class: "list-group list-group-flush" }).append($('<li/>', { text: "Circuit", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "Duration", id: "eggtimer2Name" }))));

    $("#intellichem").addClass("d-none poolPanel").append($('<div/>', { text: "Intellichem Information", class: "card-header" })).append($('<ul/>', { class: "list-group list-group-flush" }).append($('<li/>', { text: "", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "pH", id: "intellichem2Name" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "ORP", id: "intellichem1Name" }))).append($('<li/>', { text: "Reading", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "watts2", id: "intellichem2Watts" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "watts1", id: "intellichem1Watts" }))).append($('<li/>', { text: "Set point", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "rpm2", id: "intellichem2RPM" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "rpm2", id: "intellichem1RPM" }))).append($('<li/>', { text: "Tank Level", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "error2", id: "intellichem2Error" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "error1", id: "intellichem1Error" }))).append($('<li/>', { text: "Mode", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "ds2", id: "intellichem2DriveState" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "ds1", id: "intellichem1DriveState" }))).append($('<li/>', { text: "Water Flow Alarm", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "run2", id: "intellichem2RunMode" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "run1", id: "intellichem1RunMode" }))).append($('<li/>', { text: "Calcium Hardness", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "run2", id: "intellichem2RunMode" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "run1", id: "intellichem1RunMode" }))).append($('<li/>', { text: "Total Alkalinity", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "run2", id: "intellichem2RunMode" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "run1", id: "intellichem1RunMode" }))).append($('<li/>', { text: "CYA", class: "list-group-item" }).append($('<div/>', { class: "float-right", text: "run2", id: "intellichem2RunMode" })).append($('<div/>', { class: "float-right mr-4 w-25", text: "run1", id: "intellichem1RunMode" }))));

    $("#light").addClass("d-none poolPanel").append($('<div/>', { text: "Lights", class: "card-header" }));

    $("#debug").addClass("w-100").append($('<div/>', { text: "Debug", class: "card-header" })).append($('<div/>', { text: "Debug Log...", id: "txtDebug" }));

    $("#navFooter").append($('<form/>', { class: "form-inline" }).append($('<button>Reset<br/>Layout</button>').addClass("btn btn-primary btn-sm m-1").attr("id", "btnResetLayout").attr("type", "button")).append($('<button>Debug:<br/>Off</button>').addClass("btn btn-success btn-sm m-1").attr("id", "debugEnable").attr("type", "button")).append($('<button>Code State</button>').addClass("btn btn-success btn-sm m-1").attr("id", "gitState").attr("type", "button")));
}

// Function to configure communications sockets receive handling -> not called until clientConfig.json available (i.e. configuration complete)
function startSocketRx() {
    socket.on('circuit', function (data) {
        console.log('Circuit received');
        if (data.hasOwnProperty('circuit')) {
            data = data.circuit;
        }
        if (data !== null) {}
    });

    socket.on('all', function (data) {
        console.log('All received');
        console.log("Ready? " + data.config.systemReady);
        if (data.hasOwnProperty('config')) {
            data = data.config;
        }
        if (data !== null) {
            if (data.systemReady === 1) {
                // hide the alert panel
                $('#alert>div').html("").addClass("d-none");
                // show all pool panels
                $('.poolPanel').removeClass("d-none");
            } else {
                setTimeout(pollForSystemReady, 1000);
            }
        }
    });
}

//Routine to recursively parse Equipment Configuration, setting associated data for DOM elements
function dataAssociate(strControl, varJSON) {
    for (var currProperty in varJSON) {
        if (_typeof(varJSON[currProperty]) !== "object") {
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

function configPanels(panel) {
    // to be implemented
}

function loadAppSettings() {
    // to be implemented
}

function pollForSystemReady() {

    // we will loop over this (via socket.on('config'...) until the system is ready.
    socket.emit('getConfig');
}

// From http://api.jquery.com/jquery/#jQuery3
// JQuery(callback), Description: Binds a function to be executed when the DOM has finished loading
$(function () {
    console.log('loaded...');

    // Load configuration (from json), process once data ready
    $.getJSON('configClient.json', function (json) {
        console.log('Loaded configClient.json');
        console.log(json);
        initializeObjects();
        buildCards();
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
        socket = io({});

        //        loadAppSettings();
        startSocketRx();

        pollForSystemReady();
    });
});