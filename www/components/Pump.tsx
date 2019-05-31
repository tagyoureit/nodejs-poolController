
import
{
    Row, Col, Table, Card, CardImg, CardText, CardBody,
    CardTitle, CardSubtitle, Button, CardFooter, CardGroup,
    Modal, ModalHeader, ModalBody, ModalFooter
} from 'reactstrap';
import CustomCard from '../components/CustomCard'
import DateTime from './DateTime'
import * as React from 'react';
import PumpConfig from './PumpConfig/PumpConfig'

interface Props
{
    data: Pump.PumpStatus;
    id: string;
    visibility: string;
    pumpConfig: Pump.ExtendedConfigObj
    circuit: Circuit.ICurrentCircuitsArr
    controlType: 'pumpConfig' | 'manual'
}
interface State
{
    modalOpen: boolean
}
class Pump extends React.Component<Props, any> {

    constructor( props: Props )
    {
        super( props )
        this.state = {
            modalOpen: false
        };
        this.toggleModal = this.toggleModal.bind( this )
    }

    toggleModal() {
        // open and close the modal
        this.setState({
            modalOpen: !this.state.modalOpen
        });
    }

    render ()
    {
        const colCount = Object.keys( this.props ).length + 1
        const colWidth = Math.floor( 12 / colCount )

        let pumps = Object.entries( this.props.data ).map( ( k ) =>
        {
            if ( k[ 1 ].pump !== undefined )
            {
                return (
                    <Card key={k[ 1 ].pump + 'card'}>
                        <CardBody className='p-0' key={k[ 1 ].pump + 'cardbody'}>
                            <CardTitle className='card-header'>  {k[ 1 ].friendlyName}</CardTitle>
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
            }
            else
            {
                console.log(`Received undefined for pump status`)
            }

        } )
        const closeBtn = <button className="close" onClick={this.toggleModal}>&times;</button>;


        const PumpConfigOrManualControl = () =>
        {

            if (this.props.controlType==='pumpConfig')
            return (
            <PumpConfig
                    pumpConfig={this.props.pumpConfig}
                    pump={this.props.data}
                    circuit={this.props.circuit}
                    id='pumpConfig'
                    visibility='visible' /> )
            else
                return (<div>Manual pump control to be implemented</div>)
        }

        return (
            <div className="tab-pane active" id="pump" role="tabpanel" aria-labelledby="pump-tab">
                <CustomCard name='Pumps' key='title' id={this.props.id} visibility={this.props.visibility} edit={this.toggleModal}>
                    <CardGroup className="">
                        {pumps}
                    </CardGroup>
                </CustomCard>

                <Modal isOpen={this.state.modalOpen} toggle={this.toggleModal} size='xl' scrollable={true}>
                        <ModalHeader toggle={this.toggleModal} close={closeBtn}>Adjust Pump Configuration</ModalHeader>
                        <ModalBody>
                        {PumpConfigOrManualControl()}
                        </ModalBody>
                        <ModalFooter>
                            <Button  onClick={this.toggleModal}>Close</Button>
                        </ModalFooter>
                    </Modal>
             

            </div>
        );
    }
}

export default Pump;