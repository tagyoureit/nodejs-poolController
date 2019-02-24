import {
    Row, Col, Button, ButtonGroup
} from 'reactstrap';

import CustomCard from '../components/CustomCard'
import React from 'react'

class EggTimer extends React.Component {

    constructor(props) {
        super(props)

    }

    formatDuration(duration) {
        let durSplit = duration.split(':')
        return `${durSplit[0]} hrs, ${durSplit[1]} mins`
    }

    render() {

        let eggTimers;
        if (this.props.data !== undefined) {
            eggTimers = Object.entries(this.props.data).map((k) => {

                return (
                    <Row key={k[1].ID + 'row'}>
                        <Col xs="4" key={k[1].ID + 'col'}>
                            {k[1].friendlyName} ({k[1].ID})

                        </Col>
                        <Col>
                            {this.formatDuration(k[1].DURATION)}
                        </Col>
                    </Row>
                )
            })
        }
        else {
            return (<div>No Egg Timers yet</div>)
        }

        return (
            <div>
                <a name='EggTimer' className="anchor"></a>
                <CustomCard name='Egg Timers'>
                    {eggTimers}
                </CustomCard>
            </div>
        );
    }
}

export default EggTimer;