import
{
    Row, Col, Button, ButtonGroup
} from 'reactstrap';

import CustomCard from '../components/CustomCard'
import * as React from 'react';

interface Props
{
    data: ScheduleModule.ScheduleObj
    id: string;
    visibility: string;
}

class EggTimer extends React.Component<Props, any> {

    constructor( props: Props )
    {
        super( props )

        // this.state = {
        //     id: 'schednotset',
        //     visibility: 'hidden'
        // }
    }

    formatDuration ( duration: string ): string
    {
        let durSplit = duration.split( ':' )
        return `${ durSplit[ 0 ] } hrs, ${ durSplit[ 1 ] } mins`
    }

    render ()
    {

        let eggTimers;
        if ( this.props !== undefined )
        {
            eggTimers = Object.entries( this.props.data ).map( ( k ) =>
            {

                return (
                    <Row key={k[ 1 ].id + 'row'}>
                        <Col xs="4" key={k[ 1 ].id + 'col'}>
                            {k[ 1 ].friendlyName} ({k[ 1 ].id})

                        </Col>
                        <Col>
                            {this.formatDuration( k[ 1 ].duration )}
                        </Col>
                    </Row>
                )
            } )
        }
        else
        {
            return ( <div>No Egg Timers yet</div> )
        }

        return (
            <div className="tab-pane active" id="eggtimer" role="tabpanel" aria-labelledby="eggtimer-tab">
                <CustomCard name='Egg Timers' id={this.props.id} visibility={this.props.visibility}>
                    {eggTimers}
                </CustomCard>
            </div>
        );
    }
}

export default EggTimer;