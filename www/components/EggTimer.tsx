import
{
    Row, Col, Button, ButtonGroup,
    Modal, ModalHeader, ModalBody, ModalFooter
} from 'reactstrap';

import CustomCard from '../components/CustomCard'
import * as React from 'react';
import EggTimerEdit from './EggTimerEdit'

interface Props
{
    data: ScheduleModule.ScheduleObj
    allCircuits: Circuit.ICurrentCircuitsArr
    id: string;
    visibility: string;
}
interface State
{
    modalOpen: boolean
}

class EggTimer extends React.Component<Props, State> {

    constructor( props: Props )
    {
        super( props )

        this.state = {
            modalOpen: false
        }

        this.toggleModal = this.toggleModal.bind( this )
    }

    toggleModal ()
    {
        // open and close the modal
        this.setState( {
            modalOpen: !this.state.modalOpen
        } );
    }

    formatDuration ( duration: string ): string
    {
        let durSplit = duration.split( ':' )
        return `${ durSplit[ 0 ] } hrs, ${ durSplit[ 1 ] } mins`
    }

    render ()
    {
        const closeBtn = <button className="close" onClick={this.toggleModal}>&times;</button>;

        let eggTimers;
        if ( this.props !== undefined )
        {
            eggTimers = Object.entries( this.props.data ).map( ( k ) =>
            {

                return (
                    <Row key={k[ 1 ].id + 'row'}>
                        <Col>
                        {k[1].id}
                        </Col>
                        <Col xs="4" key={k[ 1 ].id + 'col'}>
                            {k[ 1 ].friendlyName} ({k[ 1 ].circuitNum})

                        </Col>
                        <Col>
                            {this.formatDuration( k[ 1 ].duration.time )}
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
                <CustomCard name='Egg Timers' id={this.props.id} visibility={this.props.visibility} edit={this.toggleModal}>
                    {eggTimers}
                </CustomCard>
                <Modal isOpen={this.state.modalOpen} toggle={this.toggleModal} size='xl' >
                    <ModalHeader toggle={this.toggleModal} close={closeBtn}>Adjust Intellibrite Lights</ModalHeader>
                    <ModalBody>
                        <EggTimerEdit data={this.props.data} allCircuits={this.props.allCircuits} />
                    </ModalBody>
                    <ModalFooter>
                        <Button onClick={this.toggleModal}>Close</Button>
                    </ModalFooter>
                </Modal>
            </div>
        );
    }
}

export default EggTimer;