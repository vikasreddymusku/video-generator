import React from 'react';
import {
	Easing,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';

type TitleProps = {
	text: string;
	delay?: number;
	color?: string;
	fontSize?: number;
};

export const Title: React.FC<TitleProps> = ({
	text,
	delay = 0,
	color = '#FFFFFF',
	fontSize = 100,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const localFrame = Math.max(0, frame - delay);

	const progress = spring({
		frame: localFrame,
		fps,
		config: {
			damping: 16,
			stiffness: 130,
			mass: 0.9,
		},
	});

	const opacity = interpolate(
		localFrame,
		[0, 15],
		[0, 1],
		{
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
			easing: Easing.out(Easing.cubic),
		},
	);

	return (
		<div
			style={{
				fontSize,
				fontWeight: 900,
				letterSpacing: '-0.04em',
				color,
				opacity,
				transform: `translateY(${(1 - progress) * 70}px) scale(${
					0.93 + progress * 0.07
				})`,
				lineHeight: 0.95,
			}}
		>
			{text}
		</div>
	);
};