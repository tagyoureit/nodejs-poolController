
import * as React from 'react';

interface Props
{
    visibility: Client.Visibility | 'false'
    systemReady: 0 | 1
}

class ShouldDisplay extends React.Component<Props, any>
{


    constructor( props: Props )
    {
        super( props );

    }

    render ()
    {
        console.log( `this.props` )
        console.log( this.props )
        console.log( `props.state:` )
        console.log( this.props.visibility )
        // state = is the compenent hidden or visible per the configuration settings
        // ready = is the component loaded?  true or false
        let content:any = 'Loading....'
        let display = { display: 'block' }
        if ( this.props.visibility === 'hidden' )
        {
            display = { display: 'none' }
        }
        else if ( this.props.visibility === 'visible' && this.props.systemReady)
        {
            display = { display: 'block' }
            if ( this.props.systemReady )
            {
                content = this.props.children
            }
            else
            {
                content = content;
            }

        }
        else if (this.props.systemReady)
        {
            content = this.props.children
            display = { display: 'block' }
        }

        return (

            <div style={display}>
                {content}
            </div>

        )
    }

}
export default ShouldDisplay;