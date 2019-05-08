

/*
 "client": {
            "panelState": {
                "system": {
                    "state": "visible"
                },
                "pool": {
                    "state": "visible"
                },
                "spa": {
                    "state": "visible"
                },
                "chlorinator": {
                    "state": "visible"
                },
                "feature": {
                    "state": "visible"
                },
                "pump": {
                    "state": "visible"
                },
                "schedule": {
                    "state": "visible"
                },
                "eggtimer": {
                    "state": "visible"
                },
                "debug": {
                    "state": "visible"
                },
                "intellichem": {
                    "state": "visible"
                },
                "release": {
                    "state": "visible"
                },
                "light": {
                    "state": "visible"
                }
            }
        }
    }
*/

declare namespace Client
{
    type Visibility = 'hidden' | 'visible'

    interface IPanelState
    {
        [key: string]: any
        panelState: IPanels
        hideAux: boolean
    }

    interface IPanels
    {
        [ key: string ]: any;
        system: State
        pool: State
        spa: State
        chlorinator: State
        feature: State
        pump: State
        schedule: State
        eggtimer: State
        debug: State
        intellichem: State
        release: State
        light: State
        updateStatus: State
    }

    interface State
    {
        state: Visibility
    }
}
