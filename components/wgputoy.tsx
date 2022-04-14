import React, {CSSProperties, Dispatch, MutableRefObject, SetStateAction} from "react";
import { WgpuToyRenderer, init_wgpu } from "wgputoy";
import {ParseError} from "./parseerror";
import {UniformSliderRef} from "./uniformsliders";
import {LoadedTextures} from "./texturepicker";

interface WgpuToyProps {
    code: string,
    bindID: string,
    parentWidth: number,
    style: CSSProperties,
    play: boolean,
    setPlay: Dispatch<SetStateAction<boolean>>
    reset: boolean,
    setReset: Dispatch<SetStateAction<boolean>>
    hotReload: boolean
    manualReload: boolean
    setManualReload: Dispatch<SetStateAction<boolean>>
    setError: Dispatch<SetStateAction<ParseError>>
    loadedTextures: LoadedTextures,
    sliderRefMap: Map<string,MutableRefObject<UniformSliderRef>>
}

interface MousePosition {
    x: number,
    y: number
}

interface Dimensions {
    x: number,
    y: number
}

interface WgpuToyState {
    wgputoy: WgpuToyRenderer,
    requestAnimationFrameID: number,
    width: number,
    mouse: MousePosition,
    click: boolean
}

export default class WgpuToy extends React.Component<WgpuToyProps, WgpuToyState> {
    constructor(props) {
        super(props);
        this.state = {
            wgputoy: null,
            requestAnimationFrameID: 0,
            width: 0,
            mouse: {x: 0, y: 0},
            click: false
        }
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
    }

    handleMouseMove(e) {
        this.setState({ mouse: {x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }});
    }

    handleMouseUp(e) {
        this.setState({click: false});
    }

    handleMouseDown(e) {
        this.setState({click: true});
    }

    handleKeyDown(e) {
        this.state.wgputoy.set_keydown(e.keyCode, true);
    }

    handleKeyUp(e) {
        this.state.wgputoy.set_keydown(e.keyCode, false);
    }

    handleError(summary, row, col) {
        this.props.setError(error => ({
            summary: summary,
            position: {row: Number(row), col: Number(col)},
            success: false
        }));
    }

    resetError() {
        this.props.setError(error => ({
            summary: undefined,
            position: {row: undefined, col: undefined},
            success: true
        }));
    }

    componentDidMount() {
        init_wgpu(this.props.bindID).then(ctx => {
            this.setState({wgputoy: new WgpuToyRenderer(ctx)});
            this.state.wgputoy.on_error(this.handleError.bind(this))
            this.updateDimensions();

            // this is the only place we want to set play manually, otherwise it's UI-driven
            this.play(0);
        });
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.state.wgputoy) { //needed in race-y circumstances

            // if code changed and we're hot reloading, or
            // hot reloading was just enabled, or
            // user decided to manually reload
            if ((this.props.hotReload && this.props.code !== prevProps.code)
                || (this.props.hotReload && !prevProps.hotReload)
                || (this.props.manualReload)
            ) {
                this.setShader(this.props.code);
                this.props.setManualReload(false);
            }

            // Nasty, but apparently faster than any other method
            //if (JSON.stringify(this.props.loadedTextures) !== JSON.stringify(prevProps.loadedTextures)) {
            if (this.props.loadedTextures[0] !== prevProps.loadedTextures[0]) {
                this.loadTexture(0, this.props.loadedTextures[0]);
            }
            if (this.props.loadedTextures[1] !== prevProps.loadedTextures[1]) {
                this.loadTexture(1, this.props.loadedTextures[1]);
            }

            if (this.props.parentWidth !== prevProps.parentWidth) {
                this.updateDimensions();
            }

            if (this.props.play !== prevProps.play) {
                this.togglePlay();
            }

            if (this.props.reset && (this.props.reset !== prevProps.reset)) {
                this.reset();
            }

            if (this.state.mouse !== prevState.mouse || this.state.click !== prevState.click) {
                this.updateMouse();
            }
        }
    }

    getDimensions(parentWidth: number): Dimensions {
        const baseIncrement = Math.max(Math.floor(parentWidth / 32)-1,1);
        return {x: baseIncrement * 32, y: baseIncrement * 18};
    }

    // just an unconditional version of resize(),
    // consider a dedicated approach for reset()
    reset() {
        const dimensions = this.getDimensions(this.props.parentWidth);
        this.state.wgputoy.resize(dimensions.x, dimensions.y);
        this.props.setReset(false);
    }

    updateMouse() {
        this.state.wgputoy.set_mouse_click(this.state.click);
        this.state.wgputoy.set_mouse_pos(this.state.mouse.x, this.state.mouse.y)
    }

    updateDimensions() {
        const dimensions = this.getDimensions(this.props.parentWidth);
        if (this.state.wgputoy && this.state && dimensions.x !== this.state.width) {
            this.setState({width: dimensions.x});
            this.state.wgputoy.resize(dimensions.x, dimensions.y);
        }
    }

    setShader(_shader: string) {
        this.resetError();
        this.state.wgputoy.set_shader(_shader);
    }

    togglePlay() {
        if (this.props.play) {
            this.play(0);
        } else {
            this.pause();
        }
    }

    play(time: DOMHighResTimeStamp) {
        this.updateUniforms();
        this.state.wgputoy.set_time_elapsed(time * 1e-3);
        this.state.wgputoy.render();
        this.setState({requestAnimationFrameID: requestAnimationFrame(this.play.bind(this))});
    }

    updateUniforms() {
        if (this.props.sliderRefMap) {
            [...this.props.sliderRefMap.keys()].map(uuid => {
                if (this.props.sliderRefMap.get(uuid)) {
                    this.state.wgputoy.set_custom_float(
                        this.props.sliderRefMap.get(uuid).current.getUniform(),
                        this.props.sliderRefMap.get(uuid).current.getVal())
                }
            }, this)
        }
    }

    loadTexture(index: number, uri: string) {
        fetch(uri).then(
            response => {
                if (!response.ok) {
                    throw new Error('Failed to load image');
                }
                return response.blob();
            }).then(b => b.arrayBuffer()).then(
                data => {
                    if (uri.match(/\.rgbe\.png/i)) {
                        this.state.wgputoy.load_channel_rgbe(index, new Uint8Array(data))
                    } else {
                        this.state.wgputoy.load_channel(index, new Uint8Array(data))
                    }
                }
            ).catch(error => console.error(error));
    }

    pause() {
        cancelAnimationFrame(this.state.requestAnimationFrameID);
    }

    render() {
        return (
            <canvas
                onMouseMove={this.handleMouseMove}
                onMouseDown={this.handleMouseDown}
                onMouseUp={this.handleMouseUp}
                onMouseLeave={this.handleMouseUp}
                id={this.props.bindID}
                style={this.props.style}
            />
        );
    }
}