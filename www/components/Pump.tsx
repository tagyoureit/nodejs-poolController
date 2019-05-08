
import
{
    Row, Col, Table, Card, CardImg, CardText, CardBody,
    CardTitle, CardSubtitle, Button, CardFooter, CardGroup
} from 'reactstrap';
import CustomCard from '../components/CustomCard'
import DateTime from './DateTime'
import * as React from 'react';

interface Props
{
    data: Pump.PumpStatus;
    id: string;
    visibility: string;
}

class Pump extends React.Component<Props, any> {

    constructor( props: Props )
    {
        super( props )

        this.handleToggleState = this.handleToggleState.bind( this )

    }

    handleToggleState ()
    {
        //TODO: Implement
    }


    render ()
    {
        const colCount = Object.keys( this.props ).length + 1
        const colWidth = Math.floor( 12 / colCount )

        let pumps = Object.entries( this.props.data ).map( ( k ) =>
        {

            return (
                <Card key={k[ 1 ].pump + 'card'}>
                    <CardBody className='p-0' key={k[ 1 ].pump + 'cardbody'}>
                        <CardTitle className='card-header'>  {k[ 1 ].name}</CardTitle>
                        <CardText className='text-right mr-3 pt-0'>
                            Watts: {k[ 1 ].watts}
                            <br />
                            RPM: {k[ 1 ].rpm}
                            <br />
                            Error: {k[ 1 ].err}
                            <br />
                            Drive state: {k[ 1 ].drivestate}
                            <br />
                            Mode: {k[ 1 ].mode}
                            <br />
                        </CardText>
                    </CardBody>
                </Card> )


        } )

        return (
            <div className="tab-pane active" id="pump" role="tabpanel" aria-labelledby="pump-tab">
                <CustomCard name='Pumps' key='title' id={this.props.id} visibility={this.props.visibility}>
                    <CardGroup className="">
                        {pumps}
                    </CardGroup>
                </CustomCard>
            </div>
        );
    }
}

export default Pump;