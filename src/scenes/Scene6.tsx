import React from 'react';
import {
	AbsoluteFill,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import {ParticleBackground} from '../components/ParticleBackground';

export const Scene6: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const reveal = interpolate(
		frame,
		[0, 25],
		[0, 1],
		{
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		},
	);

	const ctaProgress = spring({
		frame: Math.max(0, frame - 20),
		fps,
		config: {
			damping: 10,
			stiffness: 110,
			mass: 0.75,
		},
	});

	const pulse =
		1 +
		Math.sin(frame / 7) *
			0.015 *
			ctaProgress;

	return (
		<AbsoluteFill
			style={{
				padding: '85px 120px',
				boxSizing: 'border-box',
				background:
					'radial-gradient(circle at 75% 50%, #242000 0%, #050505 48%)',
			}}
		>
			<ParticleBackground count={20} />

			<div
				style={{
					display: 'flex',
					height: '100%',
					alignItems: 'center',
					justifyContent: 'space-between',
					zIndex: 2,
				}}
			>
				<div
					style={{
						width: '52%',
						opacity: reveal,
						transform: `translateX(${
							(1 - reveal) * -60
						}px)`,
					}}
				>
					<div
						style={{
							color: '#FFE500',
							fontWeight: 700,
							fontSize: 28,
							letterSpacing: '0.25em',
						}}
					>
						TINITIATE AI SOLUTIONS
					</div>

					<div
						style={{
							fontWeight: 900,
							fontSize: 103,
							lineHeight: 0.95,
							marginTop: 32,
						}}
					>
						AWS
						<br />
						DATA ENGINEERING
					</div>

					<div
						style={{
							marginTop: 55,
							display: 'inline-flex',
							backgroundColor: '#FFE500',
							color: '#050505',
							borderRadius: 20,
							padding: '25px 55px',
							fontSize: 40,
							fontWeight: 900,
							transform: `scale(${pulse})`,
							boxShadow:
								'0 0 55px rgba(255,229,0,0.25)',
						}}
					>
						ENROLL NOW →
					</div>
				</div>

				<div
					style={{
						width: 650,
						border:
							'1px solid rgba(255,229,0,0.25)',
						borderRadius: 30,
						padding: '48px 54px',
						boxSizing: 'border-box',
						background:
							'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025))',
						boxShadow:
							'0 25px 80px rgba(0,0,0,0.5)',
						opacity: reveal,
					}}
				>
					<ContactLine
						label="EMAIL"
						value="contact@tinitiateai.com"
					/>

					<ContactLine
						label="PHONE"
						value="+91 6309123485"
					/>

					<ContactLine
						label="WEB"
						value="www.tinitiateai.com"
					/>

					<ContactLine
						label="ADDRESS"
						value="13-16-58, Road No 4, Kamala Nagar, P&T Colony, Chaitanyapuri, Hyderabad, 500060, Telangana, India"
					/>
				</div>
			</div>

			<div
				style={{
					position: 'absolute',
					bottom: 55,
					left: 0,
					right: 0,
					textAlign: 'center',
					color: '#FFE500',
					fontSize: 21,
					fontWeight: 700,
					letterSpacing: '0.38em',
				}}
			>
				LEARN. BUILD. LEAD THE FUTURE.
			</div>
		</AbsoluteFill>
	);
};

const ContactLine: React.FC<{
	label: string;
	value: string;
}> = ({label, value}) => {
	return (
		<div
			style={{
				marginBottom: 28,
			}}
		>
			<div
				style={{
					color: '#FFE500',
					fontWeight: 800,
					fontSize: 17,
					letterSpacing: '0.18em',
					marginBottom: 7,
				}}
			>
				{label}
			</div>

			<div
				style={{
					color: '#FFFFFF',
					fontSize: 24,
					lineHeight: 1.35,
				}}
			>
				{value}
			</div>
		</div>
	);
};