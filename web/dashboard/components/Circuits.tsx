import
{
    ListGroup, ListGroupItem, Button
} from 'reactstrap';
import CustomCard from './CustomCard'
import { toggleCircuit } from './Socket_Client'
import * as React from 'react';
import { IStateCircuit } from './PoolController';

interface Props
{
    circuits: IStateCircuit[];
    hideAux: boolean,
    id: string;
    visibility: string;
}


class Circuits extends React.Component<Props, any> {

    constructor( props: Props )
    {
        super( props )

        this.handleClick = this.handleClick.bind( this );
    }

    circuit = () =>
    {
        if ( typeof this.props.circuits === 'undefined' ) return ( <div /> );
        // TODO: Aux Extra and NOT used should be hidden.
        // for ( var cir in data )
        // {
        //     // check to make sure we have the right data
        //     if ( data[ cir ].hasOwnProperty( 'name' ) )
        //     {
        //         // if hideAux is true skip the unused circuits
        //         if ( [ 'NOT USED', 'AUX EXTRA' ].indexOf( data[ cir ].name ) !== -1 && this.props.hideAux )
        //         {
        //         }
        //         else
        //         {
        return this.props.circuits.map( feature =>
        {
            return (
                <ListGroupItem key={feature.id + 'featurelistgroupkey'}>
                    <div className='d-flex justify-content-between'>

                        {feature.name}

                        <Button color={feature.isOn ? 'success' : 'primary'} key={feature.id + 'feature'} onClick={this.handleClick} value={feature.id} >{feature.isOn ? 'On' : 'Off'}

                        </Button>

                    </div>
                </ListGroupItem>
            )


        } )
    }
    handleClick = ( event: any ): any =>
    {
        toggleCircuit( event.target.value )
    }
    render ()
    {
        return (
            <div className="feature-pane active" id={this.props.id} role="tabpanel" aria-labelledby="feature-tab">
                <CustomCard name={this.props.id === 'features' ? 'Features' : 'Circuits'} id={this.props.id} visibility={this.props.visibility}>
                    <ListGroup flush >
                        {this.circuit()}
                    </ListGroup>
                </CustomCard>
            </div>
        );
    }
}

export default Circuits;