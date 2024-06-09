module.exports = {
  apps : [
    {
      "name": "REM",
      "script": "npm",
      "args": [
        "start"
      ],
      "cwd": "/home/pi/relayEquipmentManager",
      "restart_delay": 10000,
      "watch": [
        "boards",
        "config",
        "connections",
        "devices",
        "gpio",
        "i2c-bus",
        "logger",
        "pages",
        "pinouts",
        "spi-adc",
        "web",
        "package.json"
      ],
      "watch_delay": 5000,
      "kill_timeout": 15000
    },
    {
      "name": "dashPanel",
      "script": "npm",
      "args": [
        "start"
      ],
      "cwd": "/home/pi/nodejs-poolController-dashPanel",
      "restart_delay": 10000,
      "watch": [
        "pages",
        "scripts",
        "server",
        "package.json"
      ],
      "watch_delay": 5000,
      "kill_timeout": 15000
    },
    {
      "name": "njsPC",
      "script": "npm",
      "args": [
        "start"
      ],
      "cwd": "/home/pi/nodejs-poolController",
      "restart_delay": 10000,
      "watch": [
        "config",
        "controller",
        "logger",
        "web",
        "package.json"
      ],
      "watch_delay": 5000,
      "kill_timeout": 15000
    }
  ]
};